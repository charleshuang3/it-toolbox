<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { bytesToHex } from '@noble/ciphers/utils.js';
import { hmac } from '@noble/hashes/hmac.js';
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';

type HashFunction = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';
type OutputEncoding = 'hex' | 'base64' | 'base64url';

const hashFunctions: { label: string; value: HashFunction }[] = [
  { label: 'MD5', value: 'md5' },
  { label: 'SHA1', value: 'sha1' },
  { label: 'SHA256', value: 'sha256' },
  { label: 'SHA384', value: 'sha384' },
  { label: 'SHA512', value: 'sha512' },
];

const outputEncodings: { label: string; value: OutputEncoding }[] = [
  { label: 'Hexadecimal (base 16)', value: 'hex' },
  { label: 'Base64 (base 64)', value: 'base64' },
  { label: 'Base64url (base 64 with url safe chars)', value: 'base64url' },
];

const plainText = ref('');
const secret = ref('');
const hashFunction = ref<HashFunction>('sha256');
const encoding = ref<OutputEncoding>('hex');

function getHashFunction(hashFunc: HashFunction) {
  switch (hashFunc) {
    case 'md5':
      return md5;
    case 'sha1':
      return sha1;
    case 'sha256':
      return sha256;
    case 'sha384':
      return sha384;
    case 'sha512':
      return sha512;
    default:
      return sha256;
  }
}

function formatOutput(hashBytes: Uint8Array, enc: OutputEncoding): string {
  switch (enc) {
    case 'hex':
      return bytesToHex(hashBytes);
    case 'base64url':
      return bytesToBase64url(hashBytes);
    case 'base64':
    default:
      return bytesToBase64(hashBytes);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // @ts-expect-error: toBase64 is supported on browsers.
  if (bytes.toBase64) {
    // @ts-expect-error: toBase64 is supported on browsers.
    return bytes.toBase64();
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bytesToBase64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const hmacResult = computed(() => {
  if (!plainText.value || !secret.value) {
    return '';
  }

  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(plainText.value);
  const keyBytes = encoder.encode(secret.value);

  const hashFn = getHashFunction(hashFunction.value);
  const hmacBytes = hmac(hashFn, keyBytes, messageBytes);

  return formatOutput(hmacBytes, encoding.value);
});

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function clearInputs() {
  plainText.value = '';
  secret.value = '';
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Plain text input -->
        <div class="form-control">
          <label class="label justify-between w-full">
            <span class="label-text">Plain text to compute the HMAC</span>
            <button class="btn btn-ghost btn-sm" :disabled="!plainText" @click="plainText = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
          <textarea
            v-model="plainText"
            class="textarea textarea-bordered h-24 w-full"
            placeholder="Enter the text to compute HMAC..."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
        </div>

        <!-- Secret key input -->
        <div class="form-control">
          <label class="label justify-between w-full">
            <span class="label-text">Secret key</span>
            <button class="btn btn-ghost btn-sm" :disabled="!secret" @click="secret = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
          <input
            v-model="secret"
            type="text"
            class="input input-bordered w-full"
            placeholder="Enter the secret key..."
          />
        </div>

        <!-- Hash function and encoding selectors -->
        <div class="flex gap-4">
          <div class="form-control flex-1">
            <label class="label">
              <span class="label-text">Hash function</span>
            </label>
            <select v-model="hashFunction" class="select select-bordered w-full">
              <option v-for="fn in hashFunctions" :key="fn.value" :value="fn.value">
                {{ fn.label }}
              </option>
            </select>
          </div>

          <div class="form-control flex-1">
            <label class="label">
              <span class="label-text">Output encoding</span>
            </label>
            <select v-model="encoding" class="select select-bordered w-full">
              <option v-for="enc in outputEncodings" :key="enc.value" :value="enc.value">
                {{ enc.label }}
              </option>
            </select>
          </div>
        </div>

        <!-- Result -->
        <div class="form-control">
          <label class="label justify-between w-full">
            <span class="label-text">HMAC result</span>
            <button v-if="hmacResult" class="btn btn-ghost btn-sm" @click="copyToClipboard(hmacResult)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </label>
          <textarea
            :value="hmacResult"
            class="textarea textarea-bordered font-mono text-sm w-full"
            rows="3"
            readonly
            placeholder="HMAC result will appear here..."
          ></textarea>
        </div>

        <!-- Clear button -->
        <div class="flex justify-center">
          <button class="btn btn-ghost" :disabled="!plainText && !secret" @click="clearInputs">
            <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            Clear all
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
