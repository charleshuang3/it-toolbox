<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import {
  describeDays,
  friendlyError,
  keyDescription,
  parseTarget,
  verdictView,
  type TlsResult,
} from "./tls-checker";

const input = ref("");
const sni = ref("");
const starttls = ref("");
const probe = ref(false);
const loading = ref(false);
const error = ref("");
const result = ref<TlsResult | null>(null);
const open = ref<Record<number, boolean>>({ 0: true });
const copied = ref("");

const target = computed(() => parseTarget(input.value));
const view = computed(() => (result.value ? verdictView(result.value) : null));
const alertClass = computed(() => {
  switch (view.value?.level) {
    case "ok":
      return "alert-success";
    case "warning":
      return "alert-warning";
    default:
      return "alert-error";
  }
});

async function copy(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => {
      if (copied.value === key) copied.value = "";
    }, 1500);
  } catch {
    /* clipboard unavailable */
  }
}

async function check() {
  error.value = "";
  const t = target.value;
  if (!t) {
    error.value = "Enter a host, host:port or URL.";
    return;
  }
  loading.value = true;
  result.value = null;
  try {
    const res = await fetch("/api/net/tls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: t.host,
        port: t.port,
        sni: sni.value.trim() || undefined,
        starttls: starttls.value || undefined,
        probe_versions: probe.value,
      }),
    });
    if (!res.ok) {
      let msg: string | undefined;
      try {
        msg = ((await res.json()) as { error?: string }).error;
      } catch {
        /* non-JSON body */
      }
      error.value = friendlyError(res.status, msg);
      return;
    }
    result.value = (await res.json()) as TlsResult;
    open.value = { 0: true };
  } catch {
    error.value = "Could not reach the server. Check your connection and try again.";
  } finally {
    loading.value = false;
  }
}

function fmtDate(s: string) {
  return new Date(s).toUTCString();
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <form class="flex flex-col gap-3" @submit.prevent="check">
          <div class="flex flex-wrap gap-2">
            <input
              v-model="input"
              type="text"
              class="input input-bordered min-w-0 flex-1 font-mono"
              placeholder="example.com or example.com:8443 or https://example.com/"
              spellcheck="false"
              autocomplete="off"
              aria-label="Host"
            />
            <button type="submit" class="btn btn-primary" :disabled="loading || !input.trim()">
              <span v-if="loading" class="loading loading-spinner loading-sm"></span>
              <Icon v-else icon="mdi:certificate" class="h-5 w-5" />
              Check
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <input
              v-model="sni"
              type="text"
              class="input input-bordered input-sm w-64 font-mono"
              placeholder="SNI override (optional)"
              spellcheck="false"
              aria-label="SNI override"
            />
            <select
              v-model="starttls"
              class="select select-bordered select-sm"
              aria-label="STARTTLS"
            >
              <option value="">Direct TLS</option>
              <option value="smtp">STARTTLS: SMTP</option>
              <option value="imap">STARTTLS: IMAP</option>
              <option value="postgres">PostgreSQL SSL</option>
            </select>
            <label class="label cursor-pointer gap-2">
              <input v-model="probe" type="checkbox" class="toggle toggle-sm" />
              <span class="label-text">Probe TLS versions</span>
            </label>
          </div>
          <div v-if="input && !target" class="text-sm opacity-70">
            Could not parse the host or port.
          </div>
        </form>

        <div v-if="error" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ error }}</span>
        </div>

        <template v-if="result && view">
          <div role="alert" class="alert" :class="alertClass">
            <Icon
              :icon="
                view.level === 'ok'
                  ? 'solar:shield-check-bold'
                  : view.level === 'warning'
                    ? 'solar:danger-triangle-bold'
                    : 'solar:shield-cross-bold'
              "
              class="h-8 w-8"
            />
            <div>
              <div class="text-lg font-bold">{{ view.title }}</div>
              <ul v-if="view.details.length" class="list-disc pl-5 text-sm">
                <li v-for="d in view.details" :key="d">{{ d }}</li>
              </ul>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><span class="opacity-60">Host:</span> {{ result.host }}:{{ result.port }}</div>
            <div><span class="opacity-60">SNI / verified name:</span> {{ result.sni }}</div>
            <div><span class="opacity-60">Address:</span> {{ result.connection.address }}</div>
            <div><span class="opacity-60">Protocol:</span> {{ result.connection.version }}</div>
            <div class="break-all">
              <span class="opacity-60">Cipher suite:</span> {{ result.connection.cipher_suite }}
            </div>
            <div><span class="opacity-60">ALPN:</span> {{ result.connection.alpn || "none" }}</div>
            <div>
              <span class="opacity-60">OCSP stapling:</span>
              {{ result.connection.ocsp_stapled ? "yes" : "no" }}
            </div>
            <div>
              <span class="opacity-60">Handshake:</span> {{ result.connection.handshake_ms }} ms
            </div>
          </div>

          <div v-if="result.probes?.length">
            <div class="divider">Supported TLS versions</div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="p in result.probes"
                :key="p.version"
                class="badge badge-lg"
                :class="p.supported ? 'badge-success' : 'badge-ghost'"
                :title="p.supported ? p.cipher_suite : p.error"
              >
                {{ p.version }}: {{ p.supported ? "supported" : "no" }}
              </div>
            </div>
          </div>

          <div class="divider">Certificate chain ({{ result.chain.length }})</div>
          <div
            v-for="(c, i) in result.chain"
            :key="c.sha256"
            class="collapse collapse-arrow bg-base-200"
          >
            <input type="checkbox" :checked="open[i]" @change="open[i] = !open[i]" />
            <div class="collapse-title font-medium">
              <span class="opacity-60">#{{ i }}</span> {{ c.subject }}
              <span
                class="badge badge-sm ml-2"
                :class="c.days_remaining < 0 ? 'badge-error' : 'badge-ghost'"
                >{{ describeDays(c.days_remaining) }}</span
              >
            </div>
            <div class="collapse-content text-sm">
              <dl class="grid grid-cols-1 gap-y-1 sm:grid-cols-[10rem_1fr]">
                <dt class="opacity-60">Issuer</dt>
                <dd class="break-all">{{ c.issuer }}</dd>
                <dt class="opacity-60">Serial</dt>
                <dd class="font-mono break-all">{{ c.serial }}</dd>
                <dt class="opacity-60">Not before</dt>
                <dd>{{ fmtDate(c.not_before) }}</dd>
                <dt class="opacity-60">Not after</dt>
                <dd>{{ fmtDate(c.not_after) }}</dd>
                <dt class="opacity-60">SANs</dt>
                <dd class="break-all">
                  {{ [...c.dns_names, ...c.ip_addresses].join(", ") || "none" }}
                </dd>
                <dt class="opacity-60">Public key</dt>
                <dd>{{ keyDescription(c) }}</dd>
                <dt class="opacity-60">Signature</dt>
                <dd>{{ c.signature_algorithm }}</dd>
                <dt class="opacity-60">CA</dt>
                <dd>{{ c.is_ca ? "yes" : "no" }}{{ c.self_signed ? " (self-signed)" : "" }}</dd>
                <dt class="opacity-60">Key usage</dt>
                <dd>{{ [...c.key_usage, ...c.ext_key_usage].join(", ") || "none" }}</dd>
                <dt class="opacity-60">SHA-256</dt>
                <dd class="flex items-start gap-2">
                  <span class="font-mono break-all">{{ c.sha256 }}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    @click="copy(`fp${i}`, c.sha256)"
                  >
                    <Icon icon="solar:copy-bold" class="h-4 w-4" />
                    {{ copied === `fp${i}` ? "Copied" : "Copy" }}
                  </button>
                </dd>
              </dl>
              <div class="mt-3">
                <button type="button" class="btn btn-ghost btn-sm" @click="copy(`pem${i}`, c.pem)">
                  <Icon icon="solar:copy-bold" class="h-4 w-4" />
                  {{ copied === `pem${i}` ? "Copied" : "Copy PEM" }}
                </button>
                <pre class="bg-base-300 mt-2 max-h-48 overflow-auto rounded p-2 text-xs">{{
                  c.pem
                }}</pre>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
