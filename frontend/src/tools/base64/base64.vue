<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { base64ToBytes, bytesToBase64, decodeText, encodeText, stripDataUri } from "./base64";

const mode = ref<"encode" | "decode">("encode");
const input = ref("");
const urlSafe = ref(false);
const padding = ref(true);

const result = computed(() => {
  if (!input.value) return { output: "", error: "" };
  try {
    if (mode.value === "encode") {
      return {
        output: encodeText(input.value, { urlSafe: urlSafe.value, padding: padding.value }),
        error: "",
      };
    }
    return { output: decodeText(stripDataUri(input.value)), error: "" };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

function copy(text: string) {
  navigator.clipboard.writeText(text);
}

function swap() {
  if (result.value.output) {
    input.value = result.value.output;
  }
  mode.value = mode.value === "encode" ? "decode" : "encode";
}

// File section
const fileError = ref("");
const fileBase64 = ref("");
const fileName = ref("");
const fileUrlSafe = ref(false);
const fileBytes = ref<Uint8Array | null>(null);

async function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  fileError.value = "";
  if (!f) return;
  try {
    fileBytes.value = new Uint8Array(await f.arrayBuffer());
    fileName.value = f.name;
    fileBase64.value = bytesToBase64(fileBytes.value, { urlSafe: fileUrlSafe.value });
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err);
  }
}

function refreshFileBase64() {
  if (fileBytes.value) {
    fileBase64.value = bytesToBase64(fileBytes.value, { urlSafe: fileUrlSafe.value });
  }
}

const b64Input = ref("");
const downloadName = ref("download.bin");
const downloadError = ref("");

function download() {
  downloadError.value = "";
  try {
    const bytes = base64ToBytes(stripDataUri(b64Input.value));
    const blob = new Blob([bytes as BlobPart]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName.value || "download.bin";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    downloadError.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-wrap items-center gap-4">
          <div class="join">
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': mode === 'encode' }"
              @click="mode = 'encode'"
            >
              Encode
            </button>
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': mode === 'decode' }"
              @click="mode = 'decode'"
            >
              Decode
            </button>
          </div>
          <template v-if="mode === 'encode'">
            <label class="label cursor-pointer gap-2">
              <input v-model="urlSafe" type="checkbox" class="checkbox checkbox-sm" />
              <span class="label-text">URL-safe</span>
            </label>
            <label class="label cursor-pointer gap-2">
              <input v-model="padding" type="checkbox" class="checkbox checkbox-sm" />
              <span class="label-text">Padding (=)</span>
            </label>
          </template>
          <button class="btn btn-ghost btn-sm" @click="swap">
            <Icon icon="solar:transfer-horizontal-bold" class="h-4 w-4" />
            Swap
          </button>
        </div>

        <div class="form-control">
          <LabelWithActions :label="mode === 'encode' ? 'Text' : 'Base64'">
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="input = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            v-model="input"
            class="textarea textarea-bordered h-32 w-full font-mono text-sm"
            :placeholder="mode === 'encode' ? 'Text to encode...' : 'Base64 to decode...'"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="result.error" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ result.error }}</span>
        </div>

        <div class="form-control">
          <LabelWithActions :label="mode === 'encode' ? 'Base64' : 'Text'">
            <button v-if="result.output" class="btn btn-ghost btn-sm" @click="copy(result.output)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </LabelWithActions>
          <textarea
            :value="result.output"
            class="textarea textarea-bordered h-32 w-full font-mono text-sm"
            readonly
            placeholder="Result will appear here..."
          ></textarea>
        </div>

        <div class="divider">Files</div>

        <div class="form-control">
          <LabelWithActions label="File to Base64">
            <label class="label cursor-pointer gap-2">
              <input
                v-model="fileUrlSafe"
                type="checkbox"
                class="checkbox checkbox-sm"
                @change="refreshFileBase64"
              />
              <span class="label-text">URL-safe</span>
            </label>
            <button v-if="fileBase64" class="btn btn-ghost btn-sm" @click="copy(fileBase64)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </LabelWithActions>
          <input type="file" class="file-input file-input-bordered w-full" @change="onFileChange" />
          <div v-if="fileError" role="alert" class="alert alert-error mt-2">
            <span>{{ fileError }}</span>
          </div>
          <textarea
            v-if="fileBase64"
            :value="fileBase64"
            class="textarea textarea-bordered mt-2 h-32 w-full font-mono text-sm"
            readonly
            :aria-label="`Base64 of ${fileName}`"
          ></textarea>
        </div>

        <div class="form-control">
          <LabelWithActions label="Base64 to file" />
          <textarea
            v-model="b64Input"
            class="textarea textarea-bordered h-24 w-full font-mono text-sm"
            placeholder="Paste Base64 (or a data: URI)..."
            spellcheck="false"
          ></textarea>
          <div class="mt-2 flex flex-wrap gap-2">
            <input
              v-model="downloadName"
              type="text"
              class="input input-bordered flex-1"
              placeholder="File name"
            />
            <button class="btn btn-primary" :disabled="!b64Input" @click="download">
              <Icon icon="solar:download-bold" class="h-4 w-4" />
              Download
            </button>
          </div>
          <div v-if="downloadError" role="alert" class="alert alert-error mt-2">
            <span>{{ downloadError }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
