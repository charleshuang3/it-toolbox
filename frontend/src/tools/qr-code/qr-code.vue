<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { clampSize, decodeQr, generatePngDataUrl, generateSvg, type ErrorCorrection } from "./qr";

const mode = ref<"generate" | "decode">("generate");

// Generate
const text = ref("https://example.com");
const errorCorrection = ref<ErrorCorrection>("M");
const size = ref(256);
const foreground = ref("#000000");
const background = ref("#ffffff");
const pngUrl = ref("");
const svgText = ref("");
const genError = ref("");

const levels: { value: ErrorCorrection; label: string }[] = [
  { value: "L", label: "L (7%)" },
  { value: "M", label: "M (15%)" },
  { value: "Q", label: "Q (25%)" },
  { value: "H", label: "H (30%)" },
];

let genToken = 0;
async function generate() {
  const token = ++genToken;
  if (!text.value) {
    pngUrl.value = "";
    svgText.value = "";
    genError.value = "";
    return;
  }
  const opts = {
    text: text.value,
    errorCorrection: errorCorrection.value,
    size: clampSize(size.value),
    foreground: foreground.value,
    background: background.value,
  };
  try {
    const [png, svg] = await Promise.all([generatePngDataUrl(opts), generateSvg(opts)]);
    if (token !== genToken) return;
    pngUrl.value = png;
    svgText.value = svg;
    genError.value = "";
  } catch (e) {
    if (token !== genToken) return;
    pngUrl.value = "";
    svgText.value = "";
    genError.value = e instanceof Error ? e.message : String(e);
  }
}
watch([text, errorCorrection, size, foreground, background], generate, { immediate: true });

function downloadHref(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

function downloadPng() {
  if (pngUrl.value) downloadHref(pngUrl.value, "qrcode.png");
}

function downloadSvg() {
  if (!svgText.value) return;
  const url = URL.createObjectURL(new Blob([svgText.value], { type: "image/svg+xml" }));
  downloadHref(url, "qrcode.svg");
  URL.revokeObjectURL(url);
}

// Decode
const decoded = ref("");
const decodeError = ref("");
const previewUrl = ref("");
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const copied = ref(false);

function copy(value: string) {
  navigator.clipboard.writeText(value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image"));
    img.src = url;
  });
}

async function decodeFile(file: File) {
  decoded.value = "";
  decodeError.value = "";
  if (!file.type.startsWith("image/")) {
    decodeError.value = "The selected file is not an image.";
    return;
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = URL.createObjectURL(file);
  try {
    const img = await loadImage(previewUrl.value);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = await decodeQr(data.data, data.width, data.height);
    if (result === null) {
      decodeError.value = "No QR code found in the image.";
    } else {
      decoded.value = result;
    }
  } catch (e) {
    decodeError.value = e instanceof Error ? e.message : String(e);
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) decodeFile(file);
  input.value = "";
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) decodeFile(file);
}

function onPaste(e: ClipboardEvent) {
  if (mode.value !== "decode") return;
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (file) {
    e.preventDefault();
    decodeFile(file);
  }
}

onMounted(() => window.addEventListener("paste", onPaste));
onBeforeUnmount(() => {
  window.removeEventListener("paste", onPaste);
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

function useAsInput() {
  text.value = decoded.value;
  mode.value = "generate";
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div role="tablist" class="tabs tabs-box w-fit">
          <button
            role="tab"
            class="tab"
            :class="{ 'tab-active': mode === 'generate' }"
            @click="mode = 'generate'"
          >
            Generate
          </button>
          <button
            role="tab"
            class="tab"
            :class="{ 'tab-active': mode === 'decode' }"
            @click="mode = 'decode'"
          >
            Decode
          </button>
        </div>

        <template v-if="mode === 'generate'">
          <div class="form-control">
            <LabelWithActions label="Text or URL">
              <button class="btn btn-ghost btn-sm" :disabled="!text" @click="text = ''">
                <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
              </button>
            </LabelWithActions>
            <textarea
              v-model="text"
              class="textarea textarea-bordered h-24 w-full"
              placeholder="Enter text to encode..."
              spellcheck="false"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="form-control">
              <label class="label"><span class="label-text">Error correction</span></label>
              <select v-model="errorCorrection" class="select select-bordered w-full">
                <option v-for="l in levels" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text">Size (px)</span></label>
              <input
                v-model.number="size"
                type="number"
                min="64"
                max="2048"
                step="16"
                class="input input-bordered w-full"
              />
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text">Foreground</span></label>
              <input
                v-model="foreground"
                type="color"
                class="input input-bordered h-12 w-full p-1"
              />
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text">Background</span></label>
              <input
                v-model="background"
                type="color"
                class="input input-bordered h-12 w-full p-1"
              />
            </div>
          </div>

          <div v-if="genError" role="alert" class="alert alert-error">
            <span>{{ genError }}</span>
          </div>

          <div v-if="pngUrl" class="flex flex-col items-center gap-4">
            <div class="max-w-full overflow-auto rounded border border-base-300">
              <img :src="pngUrl" alt="Generated QR code" class="block max-w-full" />
            </div>
            <div class="flex flex-wrap justify-center gap-2">
              <button class="btn btn-primary btn-sm" @click="downloadPng">
                <Icon icon="solar:download-bold" class="h-4 w-4" />
                Download PNG
              </button>
              <button class="btn btn-primary btn-sm" @click="downloadSvg">
                <Icon icon="solar:download-bold" class="h-4 w-4" />
                Download SVG
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors"
            :class="dragging ? 'border-primary bg-base-200' : 'border-base-300'"
            role="button"
            tabindex="0"
            @click="fileInput?.click()"
            @keydown.enter="fileInput?.click()"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <Icon icon="solar:upload-bold" class="h-8 w-8" />
            <span>Drop an image, click to choose, or paste from clipboard</span>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileChange"
            />
          </div>

          <div v-if="decodeError" role="alert" class="alert alert-error">
            <span>{{ decodeError }}</span>
          </div>

          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Uploaded image"
            class="mx-auto max-h-64 max-w-full rounded border border-base-300"
          />

          <div v-if="decoded" class="form-control">
            <LabelWithActions label="Decoded text">
              <button class="btn btn-ghost btn-sm" @click="copy(decoded)">
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                {{ copied ? "Copied" : "Copy" }}
              </button>
              <button class="btn btn-ghost btn-sm" @click="useAsInput">
                <Icon icon="solar:qr-code-bold" class="h-4 w-4" />
                Generate
              </button>
            </LabelWithActions>
            <textarea
              :value="decoded"
              class="textarea textarea-bordered w-full font-mono text-sm"
              rows="4"
              readonly
            ></textarea>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
