<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { hmacText, type HashType } from '../../utils/hash';
import { formatBytes, type OutputEncoding } from '../../utils/bytes-formatter';
import LabelWithActions from '../../components/LabelWithActions.vue';

const hashFunctionValues: HashType[] = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];

const hashFunctions = hashFunctionValues.map((value) => ({
  label: value.toUpperCase(),
  value,
}));

const outputEncodings: { label: string; value: OutputEncoding }[] = [
  { label: 'Binary (base 2)', value: 'binary' },
  { label: 'Hexadecimal (base 16)', value: 'hex' },
  { label: 'Base64 (base 64)', value: 'base64' },
  { label: 'Base64url (base 64 with url safe chars)', value: 'base64url' },
];

const plainText = ref('');
const secret = ref('');
const hashFunction = ref<HashType>('sha256');
const encoding = ref<OutputEncoding>('hex');
const hmacResult = ref('');

async function computeHmac() {
  if (!plainText.value || !secret.value) {
    hmacResult.value = '';
    return;
  }

  const hmacBytes = await hmacText(hashFunction.value as HashType, secret.value, plainText.value);
  hmacResult.value = formatBytes(hmacBytes, encoding.value);
}

watch([plainText, secret, hashFunction, encoding], computeHmac);

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
          <LabelWithActions label="Plain text to compute the HMAC">
            <button class="btn btn-ghost btn-sm" :disabled="!plainText" @click="plainText = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
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
          <LabelWithActions label="Secret key">
            <button class="btn btn-ghost btn-sm" :disabled="!secret" @click="secret = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
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
          <LabelWithActions label="HMAC result">
            <button v-if="hmacResult" class="btn btn-ghost btn-sm" @click="copyToClipboard(hmacResult)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </LabelWithActions>
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
