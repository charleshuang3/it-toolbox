<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Icon } from '@iconify/vue';
import {
  convert,
  getSampleData,
  formatLabels,
  type DataFormat,
} from './format-converter';
import { useTheme } from '../../composables/useTheme';

// CodeMirror imports
import CodeMirror from 'vue-codemirror6';
import { json } from '@codemirror/lang-json';
import { json5 } from 'codemirror-json5';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';

const { codeMirrorTheme } = useTheme();

const input = ref('');
const output = ref('');
const inputFormat = ref<DataFormat>('json');
const outputFormat = ref<DataFormat>('yaml');
const error = ref<string | null>(null);

const formats: DataFormat[] = ['json', 'json5', 'xml', 'yaml', 'toml'];

// Get format options for dropdowns
const formatOptions = computed(() =>
  formats.map((format) => ({
    value: format,
    label: formatLabels[format],
  }))
);

// Dynamically compute CodeMirror extensions based on the selected input format
const inputExtensions = computed(() => {
  const theme = codeMirrorTheme();
  switch (inputFormat.value) {
    case 'yaml':
      return [theme, yaml()];
    case 'toml':
      return [theme, StreamLanguage.define(toml)];
    case 'json':
      return [theme, json()];
    case 'json5':
      return [theme, json5()];
    case 'xml':
      return [theme, xml()];
    default:
      return [theme];
  }
});

// Dynamically compute CodeMirror extensions based on the selected output format
const outputExtensions = computed(() => {
  const theme = codeMirrorTheme();
  switch (outputFormat.value) {
    case 'yaml':
      return [theme, yaml()];
    case 'toml':
      return [theme, StreamLanguage.define(toml)];
    case 'json':
      return [theme, json()];
    case 'json5':
      return [theme, json5()];
    case 'xml':
      return [theme, xml()];
    default:
      return [theme];
  }
});

// Perform conversion
function performConversion() {
  error.value = null;
  output.value = '';

  if (!input.value.trim()) {
    return;
  }

  const result = convert(input.value, inputFormat.value, outputFormat.value);

  if (result.error) {
    error.value = result.error;
  } else {
    output.value = result.result;
  }
}

// Swap input and output formats and content
function swapFormats() {
  const tempFormat = inputFormat.value;
  inputFormat.value = outputFormat.value;
  outputFormat.value = tempFormat;

  const tempContent = input.value;
  input.value = output.value;
  output.value = tempContent;

  // Re-convert if we have input
  if (input.value.trim()) {
    performConversion();
  }
}

// Update sample data when input format changes
watch(inputFormat, (newFormat) => {
  input.value = getSampleData(newFormat);
  performConversion();
});

// Auto-convert when output format changes
watch(outputFormat, () => {
  performConversion();
});

// Debounced auto-convert on input change
let debounceTimer: ReturnType<typeof setTimeout>;
watch(input, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(performConversion, 300);
});

// Copy to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Initialize with sample data
input.value = getSampleData(inputFormat.value);
performConversion();
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- Format Selectors -->
          <div class="flex flex-col md:flex-row items-center gap-4">
            <!-- Input Format -->
            <div class="form-control flex-1 w-full">
              <label class="label pb-1">
                <span class="label-text font-medium">Input Format</span>
              </label>
              <select v-model="inputFormat" class="select select-bordered select-sm w-full">
                <option v-for="option in formatOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <!-- Swap Button -->
            <div class="flex items-end">
              <button
                class="btn btn-circle btn-sm btn-ghost"
                @click="swapFormats"
                title="Swap formats"
              >
                <Icon icon="eva:swap-outline" class="h-5 w-5" />
              </button>
            </div>

            <!-- Output Format -->
            <div class="form-control flex-1 w-full">
              <label class="label pb-1">
                <span class="label-text font-medium">Output Format</span>
              </label>
              <select v-model="outputFormat" class="select select-bordered select-sm w-full">
                <option v-for="option in formatOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Input/Output Area -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Input -->
            <div class="form-control">
              <label class="label flex">
                <span class="label-text font-medium">Input ({{ formatLabels[inputFormat] }})</span>
                <div class="flex gap-1 ml-auto">
                  <button class="btn btn-xs btn-ghost" @click="copyToClipboard(input)" title="Copy">
                    <Icon icon="solar:copy-bold" class="h-3 w-3" />
                  </button>
                </div>
              </label>
              <div
                class="border border-base-content/20 rounded-btn overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary h-96"
              >
                <CodeMirror
                  v-model="input"
                  :extensions="inputExtensions"
                  basic
                  tab
                  :tab-size="2"
                  class="h-full w-full text-sm"
                />
              </div>
            </div>

            <!-- Output -->
            <div class="form-control">
              <label class="label flex">
                <span class="label-text font-medium">Output ({{ formatLabels[outputFormat] }})</span>
                <div class="flex gap-1 ml-auto">
                  <button
                    class="btn btn-xs btn-ghost"
                    @click="copyToClipboard(output)"
                    title="Copy"
                    :disabled="!output"
                  >
                    <Icon icon="solar:copy-bold" class="h-3 w-3" />
                  </button>
                </div>
              </label>
              <div
                class="border border-base-content/20 rounded-btn overflow-hidden bg-base-200 h-96"
                :class="{ 'border-error': error }"
              >
                <CodeMirror
                  v-model="output"
                  :extensions="outputExtensions"
                  :editable="false"
                  basic
                  class="h-full w-full text-sm"
                />
              </div>
            </div>
          </div>

          <!-- Error Display -->
          <div v-if="error" class="alert alert-error alert-sm py-2">
            <Icon icon="solar:danger-circle-bold" class="h-4 w-4" />
            <span class="text-sm">{{ error }}</span>
          </div>

          <!-- Success Message -->
          <div v-else-if="output && !error" class="alert alert-success alert-sm py-2">
            <Icon icon="solar:check-circle-bold" class="h-4 w-4" />
            <span class="text-sm">Conversion successful</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure CodeMirror takes up the full container height */
:deep(.cm-editor) {
  height: 100%;
}
</style>
