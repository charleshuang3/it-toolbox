<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import {
  buildUrl,
  decodeUrl,
  encodeUrl,
  parseUrl,
  type EncodeMode,
  type ParsedUrl,
} from "./url-tool";

function copy(text: string) {
  navigator.clipboard.writeText(text);
}

// Encode / decode
const direction = ref<"encode" | "decode">("encode");
const mode = ref<EncodeMode>("component");
const text = ref("");

const converted = computed(() => {
  if (!text.value) return { output: "", error: "" };
  try {
    const fn = direction.value === "encode" ? encodeUrl : decodeUrl;
    return { output: fn(text.value, mode.value), error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

// Parser
const urlInput = ref("");
const parsed = ref<ParsedUrl | null>(null);
const parseError = ref("");
const builtUrl = ref("");
const buildError = ref("");

watch(urlInput, (v) => {
  parseError.value = "";
  parsed.value = null;
  if (!v.trim()) return;
  try {
    parsed.value = parseUrl(v);
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e);
  }
});

watch(
  parsed,
  (p) => {
    buildError.value = "";
    builtUrl.value = "";
    if (!p) return;
    try {
      builtUrl.value = buildUrl(p);
    } catch (e) {
      buildError.value = e instanceof Error ? e.message : String(e);
    }
  },
  { deep: true },
);

function addParam() {
  parsed.value?.params.push({ key: "", value: "" });
}

function removeParam(i: number) {
  parsed.value?.params.splice(i, 1);
}

const partFields = [
  { key: "protocol", label: "Protocol" },
  { key: "username", label: "Username" },
  { key: "password", label: "Password" },
  { key: "hostname", label: "Host" },
  { key: "port", label: "Port" },
  { key: "pathname", label: "Path" },
  { key: "hash", label: "Hash" },
] as const;
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-wrap items-center gap-4">
          <div class="join">
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': direction === 'encode' }"
              @click="direction = 'encode'"
            >
              Encode
            </button>
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': direction === 'decode' }"
              @click="direction = 'decode'"
            >
              Decode
            </button>
          </div>
          <select v-model="mode" class="select select-bordered select-sm">
            <option value="component">Component (encodeURIComponent)</option>
            <option value="uri">Full URI (encodeURI)</option>
          </select>
        </div>

        <div class="form-control">
          <LabelWithActions label="Input">
            <button class="btn btn-ghost btn-sm" :disabled="!text" @click="text = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            v-model="text"
            class="textarea textarea-bordered h-24 w-full font-mono text-sm"
            placeholder="Text or URL..."
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="converted.error" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ converted.error }}</span>
        </div>

        <div class="form-control">
          <LabelWithActions label="Result">
            <button
              v-if="converted.output"
              class="btn btn-ghost btn-sm"
              @click="copy(converted.output)"
            >
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </LabelWithActions>
          <textarea
            :value="converted.output"
            class="textarea textarea-bordered h-24 w-full font-mono text-sm"
            readonly
            placeholder="Result will appear here..."
          ></textarea>
        </div>

        <div class="divider">URL parser</div>

        <div class="form-control">
          <LabelWithActions label="URL">
            <button class="btn btn-ghost btn-sm" :disabled="!urlInput" @click="urlInput = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            v-model="urlInput"
            class="textarea textarea-bordered h-20 w-full font-mono text-sm"
            placeholder="https://example.com:8080/path?key=value#hash"
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="parseError" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ parseError }}</span>
        </div>

        <template v-if="parsed">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div v-for="f in partFields" :key="f.key" class="form-control">
              <label class="label">
                <span class="label-text">{{ f.label }}</span>
              </label>
              <input
                v-model="parsed[f.key]"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
              />
            </div>
          </div>

          <div class="form-control">
            <LabelWithActions label="Query parameters (decoded)">
              <button class="btn btn-ghost btn-sm" @click="addParam">
                <Icon icon="solar:add-circle-bold" class="h-4 w-4" />
                Add
              </button>
            </LabelWithActions>
            <div v-if="parsed.params.length === 0" class="text-sm opacity-60 px-1">
              No query parameters
            </div>
            <div v-for="(p, i) in parsed.params" :key="i" class="mb-2 flex gap-2">
              <input
                v-model="p.key"
                type="text"
                class="input input-bordered input-sm min-w-0 flex-1 font-mono"
                placeholder="key"
                aria-label="Parameter key"
              />
              <input
                v-model="p.value"
                type="text"
                class="input input-bordered input-sm min-w-0 flex-[2] font-mono"
                placeholder="value"
                aria-label="Parameter value"
              />
              <button
                class="btn btn-ghost btn-sm"
                aria-label="Remove parameter"
                @click="removeParam(i)"
              >
                <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div v-if="buildError" role="alert" class="alert alert-error">
            <span>{{ buildError }}</span>
          </div>
          <div v-else class="form-control">
            <LabelWithActions label="Rebuilt URL">
              <button class="btn btn-ghost btn-sm" @click="copy(builtUrl)">
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                Copy
              </button>
            </LabelWithActions>
            <textarea
              :value="builtUrl"
              class="textarea textarea-bordered h-20 w-full font-mono text-sm"
              readonly
            ></textarea>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
