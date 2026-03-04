<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  sampleSchema,
  validate,
  formatError,
  getSampleData,
  type ValidationResult,
  type InputFormat,
} from './json-schema-validator';

const jsonInput = ref(getSampleData('json'));
const schemaInput = ref(sampleSchema);
const validationResult = ref<ValidationResult | null>(null);
const isValidating = ref(false);
const inputFormat = ref<InputFormat>('json');

const inputFormats: { value: InputFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'json5', label: 'JSON5' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
];

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
            <label class="label flex">
              <span class="label-text font-medium">Data</span>
              <button class="btn btn-xs btn-ghost ml-auto" @click="copyToClipboard(jsonInput)" title="Copy">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </label>
            <textarea
              v-model="jsonInput"
              class="textarea textarea-bordered font-mono text-sm w-full h-64"
              :placeholder="'Enter ' + inputFormat.toUpperCase() + ' data to validate'"
            ></textarea>
          </div>

          <!-- Schema Input -->
          <div class="form-control">
            <label class="label flex">
              <span class="label-text font-medium">JSON Schema</span>
              <button class="btn btn-xs btn-ghost ml-auto" @click="copyToClipboard(schemaInput)" title="Copy Schema">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </label>
            <textarea
              v-model="schemaInput"
              class="textarea textarea-bordered font-mono text-sm w-full h-64"
              placeholder="Enter JSON Schema"
            ></textarea>
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
