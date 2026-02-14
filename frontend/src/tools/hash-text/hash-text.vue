<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import CryptoJS from 'crypto-js';

const inputText = ref('');
const encoding = ref('base64');

const encodings = [
  { label: 'Binary (base 2)', value: 'binary' },
  { label: 'Hexadecimal (base 16)', value: 'hex' },
  { label: 'Base64 (base 64)', value: 'base64' },
  { label: 'Base64url (base 64 with url safe chars)', value: 'base64url' },
];

const hashResults = ref<Record<string, string>>({
  MD5: '',
  SHA1: '',
  SHA256: '',
  SHA224: '',
  SHA512: '',
  SHA384: '',
  SHA3: '',
  RIPEMD160: '',
});

async function computeHashes() {
  if (!inputText.value) {
    Object.keys(hashResults.value).forEach((key) => {
      hashResults.value[key] = '';
    });
    return;
  }

  const wordArray = CryptoJS.enc.Utf8.parse(inputText.value);

  // All hash algorithms using crypto-js
  hashResults.value.MD5 = formatCryptoJSHash(CryptoJS.MD5(wordArray));
  hashResults.value.SHA1 = formatCryptoJSHash(CryptoJS.SHA1(wordArray));
  hashResults.value.SHA256 = formatCryptoJSHash(CryptoJS.SHA256(wordArray));
  hashResults.value.SHA224 = formatCryptoJSHash(CryptoJS.SHA224(wordArray));
  hashResults.value.SHA512 = formatCryptoJSHash(CryptoJS.SHA512(wordArray));
  hashResults.value.SHA384 = formatCryptoJSHash(CryptoJS.SHA384(wordArray));
  hashResults.value.SHA3 = formatCryptoJSHash(CryptoJS.SHA3(wordArray));
  hashResults.value.RIPEMD160 = formatCryptoJSHash(CryptoJS.RIPEMD160(wordArray));
}

function formatCryptoJSHash(hash: CryptoJS.lib.WordArray): string {
  switch (encoding.value) {
    case 'hex':
      return hash.toString(CryptoJS.enc.Hex);
    case 'binary': {
      const hex = hash.toString(CryptoJS.enc.Hex);
      return hex
        .split('')
        .map((_c, i, arr) => {
          if (i % 2 === 0) {
            return parseInt(arr[i] + arr[i + 1], 16)
              .toString(2)
              .padStart(8, '0');
          }
          return '';
        })
        .filter((s) => s)
        .join('');
    }
    case 'base64url':
      return hash.toString(CryptoJS.enc.Base64url);
    case 'base64':
    default:
      return hash.toString(CryptoJS.enc.Base64);
  }
}

function clearInput() {
  inputText.value = '';
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

watch([inputText, encoding], computeHashes);
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Input textarea -->
        <div class="form-control">
          <label class="label justify-between w-full" for="input-text">
            <span class="label-text">Your text to hash:</span>
            <button class="btn btn-ghost btn-sm" :disabled="!inputText" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
          <textarea
            id="input-text"
            v-model="inputText"
            class="textarea textarea-bordered h-24 w-full"
            placeholder="Your string to hash..."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
        </div>

        <!-- Encoding selector -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Digest encoding</span>
          </label>
          <select v-model="encoding" class="select select-bordered w-full">
            <option v-for="enc in encodings" :key="enc.value" :value="enc.value">
              {{ enc.label }}
            </option>
          </select>
        </div>

        <div class="divider"></div>

        <!-- Hash results -->
        <div class="space-y-2">
          <div v-for="(value, algo) in hashResults" :key="algo" class="flex items-center gap-2">
            <div class="w-28 text-sm font-medium">{{ algo }}</div>
            <input type="text" :value="value" readonly class="input input-bordered flex-1" placeholder="Hash result" />
            <button class="btn btn-circle btn-sm" :disabled="!value" @click="copyToClipboard(value)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
