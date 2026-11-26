<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import type {
  CertificateInfo,
  CsrInfo,
  DecodedExtensions,
  NameAttribute,
  PublicKeyInfo,
  SigCheck,
} from "./cert-utils";

const props = defineProps<{
  item: CertificateInfo | CsrInfo | PublicKeyInfo;
  index: number;
}>();

const copied = ref("");

async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => {
      if (copied.value === key) copied.value = "";
    }, 1500);
  } catch {
    copied.value = "";
  }
}

function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const baseName = computed(() => {
  const i = props.item;
  const attrs = i.kind === "publickey" ? [] : i.subject;
  const cn = attrs.find((a) => a.short === "CN")?.value ?? `${i.kind}-${props.index + 1}`;
  return cn.replace(/[^A-Za-z0-9._-]+/g, "_");
});

function downloadPem() {
  download(props.item.pem, `${baseName.value}.pem`, "application/x-pem-file");
}

function downloadDer() {
  const ext = props.item.kind === "csr" ? "csr" : props.item.kind === "publickey" ? "der" : "cer";
  download(props.item.der.slice().buffer, `${baseName.value}.${ext}`, "application/octet-stream");
}

const cert = computed(() => (props.item.kind === "certificate" ? props.item : null));
const csr = computed(() => (props.item.kind === "csr" ? props.item : null));
const subject = computed<NameAttribute[]>(() =>
  props.item.kind === "publickey" ? [] : props.item.subject,
);
const ext = computed<DecodedExtensions | null>(() =>
  props.item.kind === "publickey" ? null : props.item.extensions,
);

const title = computed(() => {
  const cn = subject.value.find((a) => a.short === "CN")?.value;
  if (cn) return cn;
  if (props.item.kind === "publickey") return "Public key";
  return (props.item as CertificateInfo | CsrInfo).subjectString || "(empty subject)";
});

const kindLabel = computed(() =>
  props.item.kind === "certificate"
    ? "Certificate"
    : props.item.kind === "csr"
      ? "Certificate Signing Request"
      : "Public Key",
);

function fmtDate(d: Date): string {
  return d
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
}

const validityBadge = computed(() => {
  const v = cert.value?.validity;
  if (!v) return null;
  if (v.status === "valid")
    return { cls: "badge-success", text: `Valid, ${v.daysRemaining} days remaining` };
  if (v.status === "expired")
    return { cls: "badge-error", text: `Expired ${Math.abs(v.daysRemaining)} days ago` };
  return { cls: "badge-warning", text: "Not yet valid" };
});

const sigBadge = (s: SigCheck) =>
  s.status === "valid" ? "badge-success" : s.status === "invalid" ? "badge-error" : "badge-warning";
</script>

<template>
  <div class="card bg-base-100 border border-base-300">
    <div class="card-body gap-4">
      <!-- Header -->
      <div class="flex flex-wrap items-center gap-2">
        <Icon
          :icon="
            item.kind === 'certificate'
              ? 'mdi:certificate-outline'
              : item.kind === 'csr'
                ? 'mdi:file-sign'
                : 'mdi:key-outline'
          "
          class="h-6 w-6"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs opacity-60">#{{ index + 1 }} {{ kindLabel }}</div>
          <h3 class="font-semibold break-all">{{ title }}</h3>
        </div>
        <span v-if="validityBadge" class="badge" :class="validityBadge.cls">
          {{ validityBadge.text }}
        </span>
        <span v-if="cert?.selfSigned" class="badge badge-info">Self-signed</span>
        <span v-if="ext?.basicConstraints?.ca" class="badge badge-primary">CA</span>
        <span v-if="csr" class="badge" :class="sigBadge(csr.signature)">
          CSR signature {{ csr.signature.status }}
        </span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-ghost btn-sm" @click="copy(item.pem, 'pem')">
          <Icon icon="solar:copy-bold" class="h-4 w-4" />
          {{ copied === "pem" ? "Copied" : "Copy PEM" }}
        </button>
        <button class="btn btn-ghost btn-sm" @click="downloadPem">
          <Icon icon="solar:download-bold" class="h-4 w-4" />
          Download PEM
        </button>
        <button class="btn btn-ghost btn-sm" @click="downloadDer">
          <Icon icon="solar:download-bold" class="h-4 w-4" />
          Download DER
        </button>
      </div>

      <dl class="cert-grid">
        <!-- Subject / issuer -->
        <template v-if="item.kind !== 'publickey'">
          <dt>Subject</dt>
          <dd>
            <div v-if="!item.subject.length" class="opacity-60">(empty)</div>
            <div v-for="(a, i) in item.subject" :key="i" class="flex gap-2">
              <span class="w-28 shrink-0 opacity-60" :title="a.oid">{{ a.short }}</span>
              <span class="break-all" :class="{ 'font-bold text-primary': a.short === 'CN' }">
                {{ a.value }}
              </span>
            </div>
          </dd>
        </template>
        <template v-if="cert">
          <dt>Issuer</dt>
          <dd>
            <div v-for="(a, i) in cert.issuer" :key="i" class="flex gap-2">
              <span class="w-28 shrink-0 opacity-60" :title="a.oid">{{ a.short }}</span>
              <span class="break-all" :class="{ 'font-bold text-primary': a.short === 'CN' }">
                {{ a.value }}
              </span>
            </div>
          </dd>
          <dt>Serial number</dt>
          <dd class="font-mono break-all">{{ cert.serial }}</dd>
          <dt>Version</dt>
          <dd>v{{ cert.version }}</dd>
          <dt>Validity</dt>
          <dd>
            <div>Not before: {{ fmtDate(cert.validity.notBefore) }}</div>
            <div>Not after: {{ fmtDate(cert.validity.notAfter) }}</div>
            <div class="opacity-60">Lifetime: {{ cert.validity.lifetimeDays }} days</div>
          </dd>
        </template>
        <template v-if="csr">
          <dt>Version</dt>
          <dd>v{{ csr.version }}</dd>
        </template>

        <!-- SAN -->
        <template v-if="ext?.san.length">
          <dt>{{ csr ? "Requested SANs" : "Subject Alt Names" }}</dt>
          <dd>
            <div v-for="(s, i) in ext.san" :key="i" class="flex gap-2">
              <span class="badge badge-ghost badge-sm w-14 shrink-0">{{ s.type }}</span>
              <span class="break-all">{{ s.value }}</span>
            </div>
          </dd>
        </template>
        <template v-if="ext?.issuerAltNames.length">
          <dt>Issuer Alt Names</dt>
          <dd>
            <div v-for="(s, i) in ext.issuerAltNames" :key="i" class="flex gap-2">
              <span class="badge badge-ghost badge-sm w-14 shrink-0">{{ s.type }}</span>
              <span class="break-all">{{ s.value }}</span>
            </div>
          </dd>
        </template>

        <!-- Key -->
        <dt>Public key</dt>
        <dd>
          <div class="font-semibold">{{ item.publicKey.summary }}</div>
          <div class="opacity-60 text-xs break-all">OID {{ item.publicKey.oid }}</div>
        </dd>

        <!-- Signature -->
        <template v-if="item.kind !== 'publickey'">
          <dt>Signature algorithm</dt>
          <dd>
            {{ item.signatureAlgorithm }}
            <div v-if="csr" class="mt-1">
              <span class="badge badge-sm" :class="sigBadge(csr.signature)">
                {{ csr.signature.message }}
              </span>
            </div>
            <div v-else-if="cert?.selfSignature" class="mt-1">
              <span class="badge badge-sm" :class="sigBadge(cert.selfSignature)">
                {{ cert.selfSignature.message }}
              </span>
            </div>
          </dd>
        </template>

        <!-- Fingerprints -->
        <dt>SHA-256</dt>
        <dd class="flex items-start gap-1">
          <span class="font-mono text-xs break-all flex-1">{{ item.fingerprints.sha256 }}</span>
          <button
            class="btn btn-ghost btn-xs"
            title="Copy SHA-256 fingerprint"
            @click="copy(item.fingerprints.sha256, 'sha256')"
          >
            <Icon
              :icon="copied === 'sha256' ? 'solar:check-circle-bold' : 'solar:copy-bold'"
              class="h-4 w-4"
            />
          </button>
        </dd>
        <dt>SHA-1</dt>
        <dd class="flex items-start gap-1">
          <span class="font-mono text-xs break-all flex-1">{{ item.fingerprints.sha1 }}</span>
          <button
            class="btn btn-ghost btn-xs"
            title="Copy SHA-1 fingerprint"
            @click="copy(item.fingerprints.sha1, 'sha1')"
          >
            <Icon
              :icon="copied === 'sha1' ? 'solar:check-circle-bold' : 'solar:copy-bold'"
              class="h-4 w-4"
            />
          </button>
        </dd>

        <!-- Extensions -->
        <template v-if="ext">
          <template v-if="ext.basicConstraints">
            <dt>Basic constraints</dt>
            <dd>
              CA: {{ ext.basicConstraints.ca ? "yes" : "no"
              }}<span v-if="ext.basicConstraints.pathLen !== undefined">
                , path length: {{ ext.basicConstraints.pathLen }}</span
              >
            </dd>
          </template>
          <template v-if="ext.keyUsage.length">
            <dt>Key usage</dt>
            <dd class="flex flex-wrap gap-1">
              <span v-for="k in ext.keyUsage" :key="k" class="badge badge-outline">{{ k }}</span>
            </dd>
          </template>
          <template v-if="ext.extendedKeyUsage.length">
            <dt>Extended key usage</dt>
            <dd class="flex flex-wrap gap-1">
              <span
                v-for="k in ext.extendedKeyUsage"
                :key="k.oid"
                class="badge badge-outline"
                :title="k.oid"
              >
                {{ k.name }}
              </span>
            </dd>
          </template>
          <template v-if="ext.subjectKeyId">
            <dt>Subject key ID</dt>
            <dd class="font-mono text-xs break-all">{{ ext.subjectKeyId }}</dd>
          </template>
          <template v-if="ext.authorityKeyId">
            <dt>Authority key ID</dt>
            <dd class="font-mono text-xs break-all">
              <div v-if="ext.authorityKeyId.keyId">{{ ext.authorityKeyId.keyId }}</div>
              <div v-if="ext.authorityKeyId.issuer">Issuer: {{ ext.authorityKeyId.issuer }}</div>
              <div v-if="ext.authorityKeyId.serial">Serial: {{ ext.authorityKeyId.serial }}</div>
            </dd>
          </template>
          <template v-if="ext.authorityInfoAccess.length">
            <dt>Authority info access</dt>
            <dd>
              <div v-for="(a, i) in ext.authorityInfoAccess" :key="i" class="flex gap-2">
                <span class="badge badge-ghost badge-sm shrink-0">{{ a.method }}</span>
                <span class="break-all">{{ a.location.value }}</span>
              </div>
            </dd>
          </template>
          <template v-if="ext.crlDistributionPoints.length">
            <dt>CRL distribution points</dt>
            <dd>
              <div v-for="(a, i) in ext.crlDistributionPoints" :key="i" class="break-all">
                {{ a.value }}
              </div>
            </dd>
          </template>
          <template v-if="ext.policies.length">
            <dt>Certificate policies</dt>
            <dd>
              <div v-for="p in ext.policies" :key="p.oid">
                <span class="font-mono text-xs">{{ p.oid }}</span>
                <span v-if="p.name" class="ml-2">({{ p.name }})</span>
                <div v-for="u in p.cps" :key="u" class="opacity-70 break-all text-xs">
                  CPS: {{ u }}
                </div>
              </div>
            </dd>
          </template>
          <template v-if="ext.sctCount !== undefined">
            <dt>Certificate Transparency</dt>
            <dd>{{ ext.sctCount }} embedded SCT{{ ext.sctCount === 1 ? "" : "s" }}</dd>
          </template>
          <template v-if="ext.precertPoison">
            <dt>Precertificate</dt>
            <dd>CT poison extension present: this is a precertificate</dd>
          </template>
          <template v-if="ext.mustStaple">
            <dt>OCSP Must-Staple</dt>
            <dd>Yes</dd>
          </template>
        </template>
      </dl>

      <!-- Raw extensions -->
      <details v-if="ext?.list.length" class="collapse collapse-arrow bg-base-200">
        <summary class="collapse-title text-sm font-medium">
          Extensions ({{ ext.list.length }})
        </summary>
        <div class="collapse-content overflow-x-auto">
          <table class="table table-xs">
            <thead>
              <tr>
                <th>OID</th>
                <th>Name</th>
                <th>Critical</th>
                <th>Raw value (hex)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in ext.list" :key="e.oid">
                <td class="font-mono whitespace-nowrap">{{ e.oid }}</td>
                <td>
                  {{ e.name || "Unknown" }}
                  <span v-if="!e.recognised" class="badge badge-warning badge-xs ml-1">raw</span>
                </td>
                <td>{{ e.critical ? "yes" : "no" }}</td>
                <td class="font-mono break-all max-w-md">
                  {{ e.recognised ? "" : e.hex }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details class="collapse collapse-arrow bg-base-200">
        <summary class="collapse-title text-sm font-medium">PEM</summary>
        <div class="collapse-content">
          <pre class="font-mono text-xs whitespace-pre-wrap break-all">{{ item.pem }}</pre>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.cert-grid {
  display: grid;
  grid-template-columns: minmax(7rem, 11rem) 1fr;
  gap: 0.5rem 1rem;
  font-size: 0.875rem;
}

.cert-grid > dt {
  font-weight: 500;
  opacity: 0.7;
}

@media (max-width: 640px) {
  .cert-grid {
    grid-template-columns: 1fr;
    gap: 0.125rem;
  }

  .cert-grid > dd {
    margin-bottom: 0.5rem;
  }
}
</style>
