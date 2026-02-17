<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';

// Character sets
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

// Settings
const useUppercase = ref(true);
const useLowercase = ref(true);
const useNumbers = ref(true);
const useSymbols = ref(false);
const length = ref(16);
const count = ref(1);

// Results
const results = ref<string[]>([]);

// Limits
const minLength = 1;
const maxLength = 512;
const maxCount = 20;

// Computed character set
const characterSet = computed(() => {
  let chars = '';
  if (useUppercase.value) chars += UPPERCASE;
  if (useLowercase.value) chars += LOWERCASE;
  if (useNumbers.value) chars += NUMBERS;
  if (useSymbols.value) chars += SYMBOLS;
  return chars;
});

// Check if at least one character set is selected
const hasCharacterSet = computed(() => characterSet.value.length > 0);

// Generate secure random string
function generateSecureRandomString(length: number): string {
  const chars = characterSet.value;
  if (chars.length === 0) return '';

  let result = '';
  const randomValues = new Uint32Array(length);

  // Use crypto.getRandomValues for secure random generation
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    // Fallback to Math.random (not cryptographically secure)
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 4294967296);
    }
  }

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}

function generate() {
  results.value = [];

  // Validate at least one character set is selected
  if (!hasCharacterSet.value) {
    return;
  }

  // Clamp length to valid range
  if (length.value < minLength) {
    length.value = minLength;
  } else if (length.value > maxLength) {
    length.value = maxLength;
  }

  // Clamp count to valid range
  if (count.value < 1) {
    count.value = 1;
  } else if (count.value > maxCount) {
    count.value = maxCount;
  }

  for (let i = 0; i < count.value; i++) {
    results.value.push(generateSecureRandomString(length.value));
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function copyAll() {
  navigator.clipboard.writeText(results.value.join('\n'));
}

// Auto-generate on initial load and when settings change
watch(
  [useUppercase, useLowercase, useNumbers, useSymbols, length, count],
  () => {
    if (hasCharacterSet.value) {
      generate();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Character set toggles -->
        <div class="form-control">
          <div class="flex flex-wrap gap-4">
            <!-- Uppercase -->
            <label class="label cursor-pointer gap-2">
              <input v-model="useUppercase" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
              <span class="label-text">Uppercase (ABC...)</span>
            </label>

            <!-- Lowercase -->
            <label class="label cursor-pointer gap-2">
              <input v-model="useLowercase" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
              <span class="label-text">Lowercase (abc...)</span>
            </label>

            <!-- Numbers -->
            <label class="label cursor-pointer gap-2">
              <input v-model="useNumbers" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
              <span class="label-text">Numbers (123...)</span>
            </label>

            <!-- Symbols -->
            <label class="label cursor-pointer gap-2">
              <input v-model="useSymbols" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
              <span class="label-text">Symbols (!-;...)</span>
            </label>
          </div>
        </div>

        <!-- Warning if no character set selected -->
        <div v-if="!hasCharacterSet" class="alert alert-warning text-sm">
          <Icon icon="solar:danger-triangle-bold" class="h-5 w-5" />
          <span>Please select at least one character set</span>
        </div>

        <!-- Length slider -->
        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text">Length of String</span>
          </label>
          <input v-model.number="length" type="number" :min="minLength" :max="maxLength" class="input input-bordered" />
        </div>

        <!-- Number of strings to generate -->
        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text">Number of Strings</span>
          </label>
          <input v-model.number="count" type="number" class="input input-bordered" :min="1" :max="maxCount" />
        </div>

        <!-- Generate button -->
        <div class="flex gap-2 mt-2">
          <button class="btn btn-primary" @click="generate" :disabled="!hasCharacterSet">
            <Icon icon="solar:refresh-bold" class="h-5 w-5" />
            Refresh
          </button>
        </div>

        <div class="divider"></div>

        <!-- Results -->
        <div v-if="results.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Results</span>
            <button v-if="results.length > 1" class="btn btn-sm btn-ghost" @click="copyAll">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy All
            </button>
          </div>
          <div v-for="(str, index) in results" :key="index" class="flex items-center gap-2">
            <input type="text" :value="str" readonly class="input input-bordered font-mono text-sm grow" />
            <button class="btn btn-circle btn-sm btn-ghost" @click="copyToClipboard(str)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div v-else class="text-center text-base-content/50 py-8">
          Select character sets and click "Refresh" to generate strings
        </div>
      </div>
    </div>
  </div>
</template>
