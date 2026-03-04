<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  sampleSchema,
  validate,
  formatError,
  getSampleData,
  type ValidationResult,
  type InputFormat,
} from './json-schema-validator';
import { useTheme } from '../../composables/useTheme';
import LabelWithActions from '../../components/LabelWithActions.vue';

// CodeMirror imports
import CodeMirror from 'vue-codemirror6';
import { json } from '@codemirror/lang-json';
import { json5 } from 'codemirror-json5';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { yaml } from '@codemirror/lang-yaml';

const { codeMirrorTheme } = useTheme();

const jsonInput = ref(getSampleData('json'));
const schemaInput = ref(sampleSchema);
const validationResult = ref<ValidationResult | null>(null);
const isValidating = ref(false);
const inputFormat = ref<InputFormat>('json');

// Schema input mode: 'custom' or 'from-url'
const schemaInputMode = ref<'custom' | 'from-url'>('custom');
const schemaUrl = ref('https://json-schema.org/draft-07/schema');
const isFetchingSchema = ref(false);
const schemaFetchError = ref<string | null>(null);
const schemaFetchTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const schemaAbortController = ref<AbortController | null>(null);
const SCHEMA_FETCH_DELAY = 500; // ms

const inputFormats: { value: InputFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'json5', label: 'JSON5' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
];

// Dynamically compute CodeMirror extensions based on the selected input format
const dataExtensions = computed(() => {
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
  }
  // never reached
  return [];
});

// The schema is always strictly JSON
const schemaExtensions = computed(() => {
  const theme = codeMirrorTheme();
  return [theme, json()];
});

// Full validation function that handles parsing both JSON and Schema
function validateJson() {
  isValidating.value = true;
  validationResult.value = null;
  validationResult.value = validate(jsonInput.value, schemaInput.value, undefined, inputFormat.value);
  isValidating.value = false;
}

// Auto-validate on input change (debounced)
let debounceTimer: ReturnType<typeof setTimeout>;
watch([jsonInput, schemaInput, inputFormat], () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(validateJson, 300);
});

// Update sample data when format changes
watch(inputFormat, (newFormat) => {
  // Only update if the input hasn't been modified by the user
  // For simplicity, we'll just update the sample when format changes
  jsonInput.value = getSampleData(newFormat);
});

// Initial validation
validateJson();

// Copy to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Cancel pending schema fetch
function cancelSchemaFetch() {
  // Clear pending debounce timer
  if (schemaFetchTimer.value) {
    clearTimeout(schemaFetchTimer.value);
    schemaFetchTimer.value = null;
  }
  // Abort in-flight request
  if (schemaAbortController.value) {
    schemaAbortController.value.abort();
    schemaAbortController.value = null;
  }
}

// Cleanup on unmount
onUnmounted(() => {
  cancelSchemaFetch();
});

// Fetch schema from URL
async function fetchSchemaFromUrl() {
  if (!schemaUrl.value) {
    schemaFetchError.value = 'Please enter a URL';
    return;
  }

  // Cancel any pending operations
  cancelSchemaFetch();

  isFetchingSchema.value = true;
  schemaFetchError.value = null;
  schemaAbortController.value = new AbortController();

  try {
    const response = await fetch(schemaUrl.value, {
      signal: schemaAbortController.value.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const schemaData = await response.json();
    schemaInput.value = JSON.stringify(schemaData, null, 2);
    schemaFetchError.value = null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was cancelled, don't show error
      return;
    }
    schemaFetchError.value = error instanceof Error ? error.message : 'Failed to fetch schema from URL';
  } finally {
    isFetchingSchema.value = false;
    schemaAbortController.value = null;
  }
}

// Watch schemaUrl for changes and auto-fetch with debounce
watch(schemaUrl, () => {
  schemaFetchError.value = null;

  // Clear existing timer
  if (schemaFetchTimer.value) {
    clearTimeout(schemaFetchTimer.value);
  }

  // Don't auto-fetch if URL is empty
  if (!schemaUrl.value) {
    return;
  }

  // Set new timer for auto-fetch
  schemaFetchTimer.value = setTimeout(() => {
    fetchSchemaFromUrl();
  }, SCHEMA_FETCH_DELAY);
});

// Fetch when switching to 'from-url' mode
watch(schemaInputMode, (newMode) => {
  if (newMode === 'from-url' && schemaUrl.value) {
    // Clear any pending timer first
    if (schemaFetchTimer.value) {
      clearTimeout(schemaFetchTimer.value);
    }
    // Fetch immediately
    fetchSchemaFromUrl();
  }
});
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- Format Selector -->
          <div class="form-control">
            <label class="label pb-1">
              <span class="label-text font-medium">Input Format</span>
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="format in inputFormats"
                :key="format.value"
                class="btn btn-sm flex-1"
                :class="inputFormat === format.value ? 'btn-primary' : 'btn-outline'"
                @click="inputFormat = format.value"
              >
                {{ format.label }}
              </button>
            </div>
          </div>

          <!-- Data Input -->
          <div class="form-control">
            <LabelWithActions label="Data">
              <button class="btn btn-xs btn-ghost" @click="copyToClipboard(jsonInput)" title="Copy">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </LabelWithActions>
            <div
              class="border border-base-content/20 rounded-btn overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary h-64"
            >
              <CodeMirror
                v-model="jsonInput"
                :extensions="dataExtensions"
                basic
                tab
                :tab-size="2"
                class="h-full w-full text-sm"
              />
            </div>
          </div>

          <!-- Schema Input -->
          <div class="form-control">
            <label class="label flex">
              <span class="label-text font-medium">JSON Schema</span>
            </label>

            <!-- Schema Input Mode Selector -->
            <div class="flex flex-wrap gap-2 mb-2">
              <button
                class="btn btn-sm flex-1"
                :class="schemaInputMode === 'custom' ? 'btn-primary' : 'btn-outline'"
                @click="schemaInputMode = 'custom'"
              >
                Custom
              </button>
              <button
                class="btn btn-sm flex-1"
                :class="schemaInputMode === 'from-url' ? 'btn-primary' : 'btn-outline'"
                @click="schemaInputMode = 'from-url'"
              >
                From URL
              </button>
            </div>

            <!-- Custom Schema Input -->
            <div
              v-if="schemaInputMode === 'custom'"
              class="border border-base-content/20 rounded-btn overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary h-64"
            >
              <CodeMirror
                v-model="schemaInput"
                :extensions="schemaExtensions"
                basic
                tab
                :tab-size="2"
                class="h-full w-full text-sm"
              />
            </div>

            <!-- URL Schema Input -->
            <div v-else class="flex flex-col gap-2">
              <div class="flex gap-2">
                <input
                  v-model="schemaUrl"
                  type="text"
                  placeholder="https://json-schema.org/draft-07/schema"
                  class="input input-bordered input-sm flex-1"
                  @keydown.enter="fetchSchemaFromUrl"
                />
                <button
                  v-if="isFetchingSchema || schemaFetchTimer"
                  class="btn btn-sm btn-error"
                  @click="cancelSchemaFetch"
                  title="Cancel fetch"
                >
                  <Icon icon="solar:close-circle-bold" class="h-4 w-4" />
                </button>
              </div>
              <div
                v-if="isFetchingSchema || schemaFetchTimer"
                class="text-xs text-base-content/60 flex items-center gap-2"
              >
                <span class="loading loading-spinner loading-xs"></span>
                <span v-if="isFetchingSchema">Fetching schema...</span>
                <span v-else>Waiting for input...</span>
              </div>
              <div v-if="schemaFetchError" class="alert alert-error alert-sm py-2">
                <Icon icon="solar:danger-circle-bold" class="h-4 w-4" />
                <span class="text-sm">{{ schemaFetchError }}</span>
              </div>
              <div class="border border-base-content/20 rounded-btn overflow-hidden h-64">
                <CodeMirror
                  v-model="schemaInput"
                  :extensions="schemaExtensions"
                  :editable="false"
                  basic
                  class="h-full w-full text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div class="divider"></div>

        <div v-if="validationResult">
          <!-- Valid Result -->
          <div v-if="validationResult.valid" class="alert alert-success">
            <Icon icon="solar:check-circle-bold" class="h-5 w-5" />
            <span>Data is valid according to the schema!</span>
          </div>

          <!-- Invalid Result -->
          <div v-else class="space-y-2">
            <div class="alert alert-error">
              <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
              <span>Validation failed</span>
            </div>

            <div class="overflow-x-auto">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Path</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(error, index) in validationResult.errors" :key="index">
                    <td>{{ index + 1 }}</td>
                    <td class="font-mono text-xs">{{ 'instancePath' in error ? error.instancePath || '/' : '/' }}</td>
                    <td class="font-mono text-xs">{{ formatError(error) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-else class="text-center text-base-content/50 py-4">Enter data and schema to validate</div>
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
