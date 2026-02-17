<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { bytesToHex } from '@noble/ciphers/utils.js';
import { md5, sha1, ripemd160 } from '@noble/hashes/legacy.js';
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { sha3_224, sha3_256, sha3_384, sha3_512, keccak_256 } from '@noble/hashes/sha3.js';

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
  RIPEMD160: '',
  SHA224: '',
  SHA256: '',
  SHA384: '',
  SHA512: '',
  SHA3_224: '',
  SHA3_256: '',
  SHA3_384: '',
  SHA3_512: '',
  KECCAK_256: '',
});

async function computeHashes() {
  if (!inputText.value) {
    Object.keys(hashResults.value).forEach((key) => {
      hashResults.value[key] = '';
    });
    return;
  }

  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(inputText.value);

  hashResults.value.MD5 = formatHash(md5(inputBytes));
  hashResults.value.SHA1 = formatHash(sha1(inputBytes));
  hashResults.value.RIPEMD160 = formatHash(ripemd160(inputBytes));
  hashResults.value.SHA224 = formatHash(sha224(inputBytes));
  hashResults.value.SHA256 = formatHash(sha256(inputBytes));
  hashResults.value.SHA384 = formatHash(sha384(inputBytes));
  hashResults.value.SHA512 = formatHash(sha512(inputBytes));
  hashResults.value.SHA3_224 = formatHash(sha3_224(inputBytes));
  hashResults.value.SHA3_256 = formatHash(sha3_256(inputBytes));
  hashResults.value.SHA3_384 = formatHash(sha3_384(inputBytes));
  hashResults.value.SHA3_512 = formatHash(sha3_512(inputBytes));
  hashResults.value.KECCAK_256 = formatHash(keccak_256(inputBytes));
}

function formatHash(hashBytes: Uint8Array): string {
  switch (encoding.value) {
    case 'hex':
      return bytesToHex(hashBytes);
    case 'binary': {
      return Array.from(hashBytes)
        .map((b) => b.toString(2).padStart(8, '0'))
        .join('');
    }
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
