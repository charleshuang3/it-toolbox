<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { hashText, type HashType } from '../../utils/hash';
import { formatBytes, OutputEncoding } from '../../utils/bytes-formatter';

const inputText = ref('');
const encoding = ref('hex');

const encodings = [
  { label: 'Binary (base 2)', value: 'binary' },
  { label: 'Hexadecimal (base 16)', value: 'hex' },
  { label: 'Base64 (base 64)', value: 'base64' },
  { label: 'Base64url (base 64 with url safe chars)', value: 'base64url' },
];

const hashTypesValues: HashType[] = [
  'md5',
  'sha1',
  'ripemd160',
  'sha224',
  'sha256',
  'sha384',
  'sha512',
  'sha3_224',
  'sha3_256',
  'sha3_384',
  'sha3_512',
  'keccak_256',
];

const hashTypes = hashTypesValues.map((value) => ({
  label: value.toUpperCase(),
  value,
}));

const hashResults = ref<Record<string, string>>(Object.fromEntries(hashTypesValues.map((v) => [v.toUpperCase(), ''])));

async function computeHashes() {
  if (!inputText.value) {
    Object.keys(hashResults.value).forEach((key) => {
      hashResults.value[key] = '';
    });
    return;
  }

  const results = await Promise.all(
    hashTypes.map(async (ht) => {
      const hashBytes = await hashText(ht.value, inputText.value);
      return {
        key: ht.label,
        value: formatBytes(hashBytes, encoding.value as OutputEncoding),
      };
    }),
  );

  results.forEach((r) => {
    hashResults.value[r.key] = r.value;
  });
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
