<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  generateToken,
  parseJwt,
  verifySignature,
  getHeaderFields,
  getPayloadFields,
  isHmacAlgorithm,
  type ParsedResult,
  type FieldDisplay,
} from './jwt-utils';

const inputToken = ref('');
const secretKey = ref('this-is-a-safe-key');

const parsedResult = ref<ParsedResult>({
  header: null,
  payload: null,
  error: null,
});

const signatureVerified = ref<boolean | null>(null);
const verificationError = ref<string | null>(null);

const headerFields = ref<FieldDisplay[]>([]);
const payloadFields = ref<FieldDisplay[]>([]);
const hasSubtleCrypto = ref(true);

function updateFields() {
  headerFields.value = getHeaderFields(parsedResult.value.header);
  payloadFields.value = getPayloadFields(parsedResult.value.payload);
}

const isHmac = computed(() => isHmacAlgorithm(parsedResult.value.header));

function clearInput() {
  inputToken.value = '';
  secretKey.value = '';
  parsedResult.value = {
    header: null,
    payload: null,
    error: null,
  };
  signatureVerified.value = null;
  verificationError.value = null;
}

watch(inputToken, () => {
  parsedResult.value = parseJwt(inputToken.value);
  updateFields();
  const result = verifySignature(inputToken.value, secretKey.value, parsedResult.value.header);
  result.then((r) => {
    signatureVerified.value = r.verified;
    verificationError.value = r.error;
  });
});

watch([secretKey], () => {
  const result = verifySignature(inputToken.value, secretKey.value, parsedResult.value.header);
  result.then((r) => {
    signatureVerified.value = r.verified;
    verificationError.value = r.error;
  });
});

onMounted(async () => {
  // Check if crypto.subtle is available
  try {
    hasSubtleCrypto.value = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  } catch {
    hasSubtleCrypto.value = false;
  }

  const now = Math.floor(Date.now() / 1000);
  inputToken.value = await generateToken(secretKey.value, {
    sub: '1234567890',
    name: 'John Doe',
    iat: now,
    exp: now + 600, // 10 minutes
  });
  parsedResult.value = parseJwt(inputToken.value);
  updateFields();
  const result = verifySignature(inputToken.value, secretKey.value, parsedResult.value.header);
  result.then((r) => {
    signatureVerified.value = r.verified;
    verificationError.value = r.error;
  });
});
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Security warning -->
        <div v-if="!hasSubtleCrypto" class="alert alert-warning">
          <Icon icon="solar:danger-triangle-bold" class="h-5 w-5" />
          <span>
            Your browser doesn't support the Web Crypto API (crypto.subtle). JWT signature verification will not be
            available.
          </span>
        </div>

        <!-- Input textarea -->
        <div class="form-control">
          <label class="label justify-between w-full" for="input-token">
            <span class="label-text">Your JWT token:</span>
            <button class="btn btn-ghost btn-sm" :disabled="!inputToken" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
          <textarea
            id="input-token"
            v-model="inputToken"
            class="textarea textarea-bordered h-24 w-full"
            placeholder="Paste your JWT token here..."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
        </div>

        <!-- Error display -->
        <div v-if="parsedResult.error" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ parsedResult.error }}</span>
        </div>

        <div class="divider"></div>

        <!-- Header table -->
        <div v-if="headerFields.length > 0" class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Header</span>
          </label>
          <div class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th class="w-32">Field</th>
                  <th class="w-40">Meaning</th>
                  <th>Value</th>
                  <th class="w-32">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in headerFields" :key="field.field">
                  <td class="font-mono text-sm">
                    <span :class="{ 'text-primary': field.isStandard }">{{ field.field }}</span>
                  </td>
                  <td class="text-sm text-base-content/70">{{ field.meaning || '-' }}</td>
                  <td class="font-mono text-sm break-all">{{ field.value }}</td>
                  <td class="text-sm">
                    <span v-if="field.errorMessage" class="text-error">{{ field.errorMessage }}</span>
                    <span v-else class="text-base-content/30">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Payload table -->
        <div v-if="payloadFields.length > 0" class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Payload</span>
          </label>
          <div class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th class="w-32">Field</th>
                  <th class="w-40">Meaning</th>
                  <th>Value</th>
                  <th class="w-32">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in payloadFields" :key="field.field">
                  <td class="font-mono text-sm">
                    <span :class="{ 'text-primary': field.isStandard }">{{ field.field }}</span>
                  </td>
                  <td class="text-sm text-base-content/70">{{ field.meaning || '-' }}</td>
                  <td class="font-mono text-sm break-all whitespace-pre-wrap">{{ field.value }}</td>
                  <td class="text-sm">
                    <span v-if="field.errorMessage" class="text-error">{{ field.errorMessage }}</span>
                    <span v-else class="text-base-content/30">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="isHmac" class="divider"></div>

        <!-- Secret key for verification (only for HS* algorithms) -->
        <div v-if="isHmac" class="form-control">
          <label class="label">
            <span class="label-text">Secret key (for signature verification):</span>
          </label>
          <input
            v-model="secretKey"
            type="text"
            class="input input-bordered w-full"
            placeholder="Enter secret key to verify signature..."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
        </div>

        <!-- Only show divider between key input and signature status when key input is shown -->
        <div v-if="isHmac" class="divider"></div>

        <!-- Signature verification status -->
        <div v-if="signatureVerified !== null" class="form-control">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Signature Status:</span>
            <div v-if="signatureVerified" class="badge badge-success gap-1">
              <Icon icon="solar:check-circle-bold" class="h-4 w-4" />
              Verified
            </div>
            <div v-else class="badge badge-error gap-1">
              <Icon icon="solar:close-circle-bold" class="h-4 w-4" />
              Not Verified
            </div>
          </div>
          <div v-if="verificationError && !signatureVerified" class="text-sm text-error mt-1">
            {{ verificationError }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
