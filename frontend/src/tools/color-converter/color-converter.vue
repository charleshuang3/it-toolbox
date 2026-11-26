<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { getFormats, toPickerHex, wcagResult } from "./color";

const input = ref("#3b82f6");
const formats = computed(() => getFormats(input.value));
const error = computed(() =>
  input.value.trim() && !formats.value
    ? "Invalid color. Try formats like #3b82f6, rgb(59 130 246), hsl(217 91% 60%) or oklch(62% 0.2 260)."
    : "",
);
const pickerValue = computed(() => toPickerHex(input.value) ?? "#000000");

const rows = computed(() =>
  formats.value
    ? [
        { label: "HEX", value: formats.value.hex },
        { label: "RGB", value: formats.value.rgb },
        { label: "HSL", value: formats.value.hsl },
        { label: "HWB", value: formats.value.hwb },
        { label: "OKLCH", value: formats.value.oklch },
      ]
    : [],
);

const copiedKey = ref("");
function copy(key: string, value: string) {
  navigator.clipboard.writeText(value);
  copiedKey.value = key;
  setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = "";
  }, 1500);
}

// Contrast
const fg = ref("#111827");
const bg = ref("#ffffff");
const fgPicker = computed(() => toPickerHex(fg.value) ?? "#000000");
const bgPicker = computed(() => toPickerHex(bg.value) ?? "#ffffff");
const contrast = computed(() => wcagResult(fg.value, bg.value));
const contrastError = computed(() =>
  (fg.value.trim() || bg.value.trim()) && !contrast.value
    ? "Enter two valid colors to check contrast."
    : "",
);
const checks = computed(() =>
  contrast.value
    ? [
        { label: "AA normal text (4.5)", pass: contrast.value.aaNormal },
        { label: "AA large text (3)", pass: contrast.value.aaLarge },
        { label: "AAA normal text (7)", pass: contrast.value.aaaNormal },
        { label: "AAA large text (4.5)", pass: contrast.value.aaaLarge },
      ]
    : [],
);

function swap() {
  [fg.value, bg.value] = [bg.value, fg.value];
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="form-control">
          <LabelWithActions label="Color (any CSS format)">
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="input = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <div class="flex gap-2">
            <input
              type="color"
              :value="pickerValue"
              class="input input-bordered h-12 w-16 shrink-0 p-1"
              aria-label="Color picker"
              @input="input = ($event.target as HTMLInputElement).value"
            />
            <input
              v-model="input"
              type="text"
              class="input input-bordered w-full font-mono"
              placeholder="#3b82f6"
              autocapitalize="off"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <div v-if="error" role="alert" class="alert alert-error">
          <span>{{ error }}</span>
        </div>

        <div
          class="h-24 w-full rounded-lg border border-base-300"
          :style="{ backgroundColor: formats ? formats.rgb : 'transparent' }"
          aria-label="Color swatch"
        ></div>

        <div v-if="rows.length" class="flex flex-col gap-2">
          <div v-for="row in rows" :key="row.label" class="flex items-center gap-2">
            <span class="w-16 shrink-0 text-sm font-medium">{{ row.label }}</span>
            <input
              :value="row.value"
              readonly
              class="input input-bordered input-sm w-full min-w-0 font-mono"
            />
            <button class="btn btn-ghost btn-sm" @click="copy(row.label, row.value)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              <span class="hidden sm:inline">{{
                copiedKey === row.label ? "Copied" : "Copy"
              }}</span>
            </button>
          </div>
        </div>

        <div class="divider">WCAG contrast checker</div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="form-control">
            <label class="label"><span class="label-text">Foreground (text)</span></label>
            <div class="flex gap-2">
              <input
                type="color"
                :value="fgPicker"
                class="input input-bordered h-12 w-16 shrink-0 p-1"
                aria-label="Foreground picker"
                @input="fg = ($event.target as HTMLInputElement).value"
              />
              <input
                v-model="fg"
                type="text"
                class="input input-bordered w-full min-w-0 font-mono"
                spellcheck="false"
              />
            </div>
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Background</span></label>
            <div class="flex gap-2">
              <input
                type="color"
                :value="bgPicker"
                class="input input-bordered h-12 w-16 shrink-0 p-1"
                aria-label="Background picker"
                @input="bg = ($event.target as HTMLInputElement).value"
              />
              <input
                v-model="bg"
                type="text"
                class="input input-bordered w-full min-w-0 font-mono"
                spellcheck="false"
              />
            </div>
          </div>
        </div>

        <div class="flex justify-center">
          <button class="btn btn-ghost btn-sm" @click="swap">
            <Icon icon="solar:transfer-horizontal-bold" class="h-4 w-4" />
            Swap
          </button>
        </div>

        <div v-if="contrastError" role="alert" class="alert alert-error">
          <span>{{ contrastError }}</span>
        </div>

        <template v-if="contrast">
          <div
            class="rounded-lg border border-base-300 p-4"
            :style="{ color: fg, backgroundColor: bg }"
          >
            <p class="text-2xl font-bold">Large sample text</p>
            <p class="text-base">The quick brown fox jumps over the lazy dog.</p>
          </div>
          <div class="text-center text-3xl font-bold">{{ contrast.ratio }}:1</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div
              v-for="c in checks"
              :key="c.label"
              class="flex items-center justify-between rounded-lg border border-base-300 px-3 py-2"
            >
              <span class="text-sm">{{ c.label }}</span>
              <span class="badge" :class="c.pass ? 'badge-success' : 'badge-error'">
                {{ c.pass ? "Pass" : "Fail" }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
