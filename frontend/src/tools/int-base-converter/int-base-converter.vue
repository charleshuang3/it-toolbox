<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { convertBase, validInt } from './converter';

const input = ref('42');
const inputBase = ref(10);
const outputBase = ref(42);

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function updateInputBase() {
  inputBase.value = clamp(inputBase.value, 2, 64);
}

function updateOutputBase() {
  outputBase.value = clamp(outputBase.value, 2, 64);
}

function errorlessConvert(...args: Parameters<typeof convertBase>) {
  try {
    return convertBase(...args);
  } catch {
    return '';
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

const error = computed(() => validInt(input.value, inputBase.value));

const numberTable = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'
  .split('')
  .map((char, index) => [char, String(index)] as [string, string]);
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Helper -->
        <details class="collapse bg-info w-full">
          <summary class="collapse-title font-semibold flex gap-1 text-info-content">
            <Icon icon="solar:info-circle-bold" class="h-5 w-5" />
            Number Table (click to expand)
          </summary>
          <div class="collapse-content text-sm">
            <div class="grid grid-cols-8 gap-2 text-center">
              <div v-for="[char, value] in numberTable" :key="char" class="bg-base-200 p-2 rounded font-mono text-xs">
                <span class="font-bold">{{ char }}</span>
                <span class="text-base-content/60">={{ value }}</span>
              </div>
            </div>
          </div>
        </details>
        <!-- Input number -->
        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Input number</span>
          </label>
          <input
            v-model="input"
            type="text"
            class="input input-bordered font-mono grow"
            placeholder="Put your number here (ex: 42)"
          />
        </div>

        <!-- Input base -->
        <div class="form-control mt-2 flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Input base</span>
          </label>
          <input
            v-model="inputBase"
            type="number"
            class="input input-bordered font-mono grow"
            min="2"
            max="64"
            @input="updateInputBase"
          />
        </div>

        <!-- Error message -->
        <div v-if="error" class="alert alert-error mt-4">
          <span>{{ error }}</span>
        </div>

        <div class="divider"></div>

        <!-- Output conversions -->
        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Binary (2)</span>
          </label>
          <input
            type="text"
            class="input input-bordered font-mono grow"
            :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: 2 })"
            placeholder="Binary version will be here..."
            readonly
          />
          <button
            class="btn btn-circle btn-sm"
            :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: 2 })"
            @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: 2 }))"
          >
            <Icon icon="solar:copy-bold" class="h-4 w-4" />
          </button>
        </div>

        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Octal (8)</span>
          </label>
          <input
            type="text"
            class="input input-bordered font-mono grow"
            :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: 8 })"
            placeholder="Octal version will be here..."
            readonly
          />
          <button
            class="btn btn-circle btn-sm"
            :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: 8 })"
            @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: 8 }))"
          >
            <Icon icon="solar:copy-bold" class="h-4 w-4" />
          </button>
        </div>

        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Decimal (10)</span>
          </label>
          <input
            type="text"
            class="input input-bordered font-mono grow"
            :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: 10 })"
            placeholder="Decimal version will be here..."
            readonly
          />
          <button
            class="btn btn-circle btn-sm"
            :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: 10 })"
            @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: 10 }))"
          >
            <Icon icon="solar:copy-bold" class="h-4 w-4" />
          </button>
        </div>

        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Hexadecimal (16)</span>
          </label>
          <input
            type="text"
            class="input input-bordered font-mono grow"
            :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: 16 })"
            placeholder="Hexadecimal version will be here..."
            readonly
          />
          <button
            class="btn btn-circle btn-sm"
            :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: 16 })"
            @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: 16 }))"
          >
            <Icon icon="solar:copy-bold" class="h-4 w-4" />
          </button>
        </div>

        <div class="form-control flex gap-2">
          <label class="label">
            <span class="label-text text-right w-40">Base64 (64)</span>
          </label>
          <input
            type="text"
            class="input input-bordered font-mono grow"
            :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: 64 })"
            placeholder="Base64 version will be here..."
            readonly
          />
          <button
            class="btn btn-circle btn-sm"
            :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: 64 })"
            @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: 64 }))"
          >
            <Icon icon="solar:copy-bold" class="h-4 w-4" />
          </button>
        </div>

        <!-- Custom base -->
        <div class="flex">
          <div class="flex items-center gap-2 w-40 mr-2">
            <span class="label-text">Custom:</span>
            <input
              v-model="outputBase"
              type="number"
              class="input input-bordered flex-1"
              min="2"
              max="64"
              @input="updateOutputBase"
            />
          </div>

          <div class="form-control flex gap-2 flex-1">
            <input
              type="text"
              class="input input-bordered font-mono grow"
              :value="errorlessConvert({ value: input, fromBase: inputBase, toBase: outputBase })"
              :placeholder="`Base ${outputBase} will be here...`"
              readonly
            />
            <button
              class="btn btn-circle btn-sm"
              :disabled="!errorlessConvert({ value: input, fromBase: inputBase, toBase: outputBase })"
              @click="copyToClipboard(errorlessConvert({ value: input, fromBase: inputBase, toBase: outputBase }))"
            >
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
