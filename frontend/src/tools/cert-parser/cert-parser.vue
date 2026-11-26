<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import CertItem from "./cert-item.vue";
import type { ChainAnalysis, CertificateInfo, ParsedItem } from "./cert-utils";

const input = ref("");
const fileName = ref("");
const items = ref<ParsedItem[]>([]);
const fatalError = ref("");
const chain = ref<ChainAnalysis | null>(null);
const parsing = ref(false);
const dragging = ref(false);
let runId = 0;

// The parser (and its WebCrypto helpers) is only loaded once the tool is actually used.
const loadUtils = () => import("./cert-utils");

async function run(source: string | Uint8Array) {
  const id = ++runId;
  items.value = [];
  chain.value = null;
  fatalError.value = "";
  const empty = typeof source === "string" ? !source.trim() : source.length === 0;
  if (empty) return;
  parsing.value = true;
  try {
    const utils = await loadUtils();
    const parsed = await utils.parseInput(source);
    const certs = parsed.filter((p): p is CertificateInfo => p.kind === "certificate");
    const analysis = certs.length > 1 ? await utils.analyzeChain(certs) : null;
    if (id !== runId) return;
    items.value = parsed;
    chain.value = analysis;
  } catch (e) {
    if (id !== runId) return;
    fatalError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (id === runId) parsing.value = false;
  }
}

function onInput() {
  fileName.value = "";
  run(input.value);
}

async function loadFile(file: File | undefined | null) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    items.value = [];
    chain.value = null;
    fatalError.value = "File is too large (max 5 MB).";
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  input.value = "";
  fileName.value = file.name;
  await run(bytes);
}

function onFileChange(e: Event) {
  const el = e.target as HTMLInputElement;
  loadFile(el.files?.[0]);
  el.value = "";
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  loadFile(e.dataTransfer?.files?.[0]);
}

function clearAll() {
  runId++;
  input.value = "";
  fileName.value = "";
  items.value = [];
  chain.value = null;
  fatalError.value = "";
  parsing.value = false;
}

const displayItems = computed(() =>
  items.value
    .map((item, i) => ({ item, i }))
    .filter(
      (x): x is { item: Exclude<ParsedItem, { kind: "error" | "warning" }>; i: number } =>
        x.item.kind !== "error" && x.item.kind !== "warning",
    ),
);
const messages = computed(() =>
  items.value.filter(
    (x): x is Extract<ParsedItem, { kind: "error" | "warning" }> =>
      x.kind === "error" || x.kind === "warning",
  ),
);
const certList = computed(() =>
  items.value.filter((x): x is CertificateInfo => x.kind === "certificate"),
);

function certLabel(i: number): string {
  const c = certList.value[i];
  return (
    c?.subject.find((a) => a.short === "CN")?.value || c?.subjectString || `Certificate ${i + 1}`
  );
}

const chainAlert = computed(() => {
  switch (chain.value?.status) {
    case "ok":
      return {
        cls: "alert-success",
        text: "Chain is valid: every certificate is issued by the next one.",
      };
    case "incomplete":
      return {
        cls: "alert-info",
        text: "Chain links are valid, but the root certificate is not included.",
      };
    case "misordered":
      return { cls: "alert-warning", text: "Chain is misordered." };
    case "broken":
      return { cls: "alert-error", text: "Chain is broken." };
    default:
      return null;
  }
});
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Input -->
        <div class="form-control">
          <LabelWithActions label="PEM, base64 or DER (certificates, bundle, CSR, public key)">
            <label class="btn btn-ghost btn-sm">
              <Icon icon="solar:upload-bold" class="h-4 w-4" />
              Upload file
              <input
                type="file"
                class="hidden"
                accept=".pem,.crt,.cer,.der,.csr,.req,.key,.pub,.txt,application/x-x509-ca-cert,application/pkix-cert"
                @change="onFileChange"
              />
            </label>
            <button class="btn btn-ghost btn-sm" :disabled="!input && !fileName" @click="clearAll">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
              Clear
            </button>
          </LabelWithActions>
          <textarea
            v-model="input"
            class="textarea textarea-bordered h-48 w-full font-mono text-xs"
            :class="{ 'border-primary': dragging }"
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----&#10;&#10;Paste one or more PEM blocks, or drop a .pem/.crt/.cer/.der/.csr file here."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            @input="onInput"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          ></textarea>
          <div v-if="fileName" class="mt-2 text-sm opacity-70">
            <Icon icon="solar:file-bold" class="inline h-4 w-4" />
            Loaded {{ fileName }}
          </div>
          <div class="mt-1 text-xs opacity-60">
            Everything is parsed locally in your browser; nothing is sent to a server.
          </div>
        </div>

        <div v-if="parsing" class="flex justify-center">
          <span class="loading loading-spinner"></span>
        </div>

        <div v-if="fatalError" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ fatalError }}</span>
        </div>

        <div
          v-for="(m, i) in messages"
          :key="'m' + i"
          role="alert"
          class="alert"
          :class="m.kind === 'error' ? 'alert-error' : 'alert-warning'"
        >
          <Icon
            :icon="m.kind === 'error' ? 'solar:danger-circle-bold' : 'solar:danger-triangle-bold'"
            class="h-5 w-5"
          />
          <span>{{ m.message }}</span>
        </div>

        <!-- Chain -->
        <div v-if="chain && chainAlert" class="flex flex-col gap-2">
          <div role="alert" class="alert" :class="chainAlert.cls">
            <Icon icon="mdi:link-variant" class="h-5 w-5" />
            <div>
              <div class="font-semibold">{{ chainAlert.text }}</div>
              <div v-for="(msg, i) in chain.messages" :key="i" class="text-sm">{{ msg }}</div>
            </div>
          </div>
          <ol class="flex flex-col gap-1 text-sm">
            <template v-for="(c, i) in certList" :key="i">
              <li class="flex items-center gap-2">
                <span class="badge badge-neutral">#{{ i + 1 }}</span>
                <span class="break-all font-medium">{{ certLabel(i) }}</span>
                <span v-if="c.selfSigned" class="badge badge-info badge-sm">self-signed</span>
                <span v-if="c.validity.status !== 'valid'" class="badge badge-error badge-sm">
                  {{ c.validity.status === "expired" ? "expired" : "not yet valid" }}
                </span>
              </li>
              <li v-if="chain.links[i]" class="ml-6 flex flex-wrap items-center gap-2 opacity-90">
                <Icon icon="solar:arrow-down-linear" class="h-4 w-4" />
                <span
                  class="badge badge-sm"
                  :class="chain.links[i].nameMatch ? 'badge-success' : 'badge-error'"
                >
                  issuer {{ chain.links[i].nameMatch ? "matches" : "mismatch" }}
                </span>
                <span
                  class="badge badge-sm"
                  :class="
                    chain.links[i].signature.status === 'valid'
                      ? 'badge-success'
                      : chain.links[i].signature.status === 'invalid'
                        ? 'badge-error'
                        : 'badge-warning'
                  "
                  :title="chain.links[i].signature.message"
                >
                  signature {{ chain.links[i].signature.status }}
                </span>
                <span class="text-xs opacity-70">{{ chain.links[i].signature.message }}</span>
              </li>
            </template>
          </ol>
        </div>

        <!-- Items -->
        <CertItem v-for="(d, n) in displayItems" :key="d.i" :item="d.item" :index="n" />
      </div>
    </div>
  </div>
</template>
