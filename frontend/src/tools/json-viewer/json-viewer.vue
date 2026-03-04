<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import JsonEditorVue from 'json-editor-vue';
import { Mode } from 'vanilla-jsoneditor';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import LabelWithActions from '../../components/LabelWithActions.vue';

// Sample JSON data
const sampleJson = JSON.stringify(
  {
    name: 'John Doe',
    age: 30,
    email: 'john.doe@example.com',
    address: {
      street: '123 Main St',
      city: 'New York',
      country: 'USA',
      coordinates: {
        lat: 40.7128,
        lng: -74.006,
      },
    },
    hobbies: ['reading', 'gaming', 'hiking'],
    isActive: true,
    balance: 1234.56,
    metadata: {
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: null,
      tags: ['user', 'premium'],
    },
  },
  null,
  2,
);

// Input and parsed data
const jsonInput = ref(sampleJson);
const parseError = ref<string | null>(null);

// Computed property for parsed JSON data
const parsedJson = computed(() => {
  if (!jsonInput.value.trim()) {
    return null;
  }
  try {
    return JSON.parse(jsonInput.value);
  } catch {
    return null;
  }
});

// Watch for parse errors
watch(jsonInput, (newValue) => {
  if (!newValue.trim()) {
    parseError.value = null;
    return;
  }
  try {
    JSON.parse(newValue);
    parseError.value = null;
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'Invalid JSON';
  }
});

// Copy to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Format JSON
function formatJson() {
  try {
    const parsed = JSON.parse(jsonInput.value);
    jsonInput.value = JSON.stringify(parsed, null, 2);
    parseError.value = null;
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'Invalid JSON';
  }
}

// Minify JSON
function minifyJson() {
  try {
    const parsed = JSON.parse(jsonInput.value);
    jsonInput.value = JSON.stringify(parsed);
    parseError.value = null;
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : 'Invalid JSON';
  }
}

// Clear input
function clearInput() {
  jsonInput.value = '';
  parseError.value = null;
}

// Load sample data
function loadSample() {
  jsonInput.value = sampleJson;
  parseError.value = null;
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- JSON Input -->
          <div class="form-control">
            <LabelWithActions label="JSON Input">
              <button class="btn btn-xs btn-ghost" @click="formatJson" title="Format JSON">
                <Icon icon="solar:magic-stick-bold" class="h-3 w-3" />
                Format
              </button>
              <button class="btn btn-xs btn-ghost" @click="minifyJson" title="Minify JSON">
                <Icon icon="solar:minimize-square-bold" class="h-3 w-3" />
                Minify
              </button>
              <button class="btn btn-xs btn-ghost" @click="copyToClipboard(jsonInput)" title="Copy">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
                Copy
              </button>
              <button class="btn btn-xs btn-ghost" @click="clearInput" title="Clear">
                <Icon icon="solar:trash-bin-trash-bold" class="h-3 w-3" />
                Clear
              </button>
              <button class="btn btn-xs btn-ghost" @click="loadSample" title="Load Sample">
                <Icon icon="solar:document-text-bold" class="h-3 w-3" />
                Sample
              </button>
            </LabelWithActions>
            <textarea
              v-model="jsonInput"
              class="textarea textarea-bordered w-full font-mono text-sm h-48 resize-none"
              placeholder="Paste your JSON here..."
              :class="{ 'textarea-error': parseError }"
            ></textarea>
          </div>

          <!-- Error Display -->
          <div v-if="parseError" class="alert alert-error alert-sm py-2">
            <Icon icon="solar:danger-circle-bold" class="h-4 w-4" />
            <span class="text-sm">{{ parseError }}</span>
          </div>

          <div class="divider"></div>

          <!-- JSON Tree View -->
          <div class="form-control">
            <LabelWithActions label="Tree View"> </LabelWithActions>
            <div
              class="border border-base-content/20 rounded-btn overflow-hidden"
              :class="{ 'h-96': parsedJson, 'h-24 flex items-center justify-center': !parsedJson }"
            >
              <JsonEditorVue
                v-if="parsedJson"
                class="jse-theme-daisyui h-full"
                v-model="parsedJson"
                :mode="Mode.tree"
                :main-menu-bar="false"
                :navigation-bar="true"
                :status-bar="false"
                :read-only="true"
              />
              <span v-else class="text-base-content/50 text-sm">Enter valid JSON to view tree</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Style overrides for jsoneditor */
:deep(.jse-theme-daisyui) {
  height: 100%;
}
</style>
