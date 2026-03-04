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
import LabelWithActions from '../../components/LabelWithActions.vue';

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
const signatureString = ref<string>('');

function updateFields() {
  headerFields.value = getHeaderFields(parsedResult.value.header);
  payloadFields.value = getPayloadFields(parsedResult.value.payload);
  // Extract signature string (third part of JWT)
  const parts = inputToken.value.trim().split('.');
  signatureString.value = parts.length === 3 ? parts[2] : '';
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
  const result = verifySignature(
    inputToken.value,
    secretKey.value,
    parsedResult.value.header,
    parsedResult.value.payload,
  );
  result.then((r) => {
    signatureVerified.value = r.verified;
    verificationError.value = r.error;
  });
});

watch([secretKey], () => {
  const result = verifySignature(
    inputToken.value,
    secretKey.value,
    parsedResult.value.header,
    parsedResult.value.payload,
  );
  result.then((r) => {
    signatureVerified.value = r.verified;
    verificationError.value = r.error;
  });
});

onMounted(async () => {
  const now = Math.floor(Date.now() / 1000);
  inputToken.value = await generateToken(secretKey.value, {
    sub: '1234567890',
    name: 'John Doe',
    iat: now,
    exp: now + 600, // 10 minutes
  });
  parsedResult.value = parseJwt(inputToken.value);
  updateFields();
  const result = verifySignature(
    inputToken.value,
    secretKey.value,
    parsedResult.value.header,
    parsedResult.value.payload,
  );
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
        <!-- Input textarea -->
        <div class="form-control">
          <LabelWithActions label="Your JWT token:">
            <button class="btn btn-ghost btn-sm" :disabled="!inputToken" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
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

        <!-- Signature verification table -->
        <div v-if="signatureString" class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Signature</span>
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
                <tr>
                  <td class="font-mono text-sm">
                    <span class="text-primary">signature</span>
                  </td>
                  <td class="text-sm text-base-content/70">Signature String</td>
                  <td class="font-mono text-sm break-all">{{ signatureString }}</td>
                  <td class="text-sm">
                    <span v-if="signatureVerified === true" class="text-success">Valid</span>
                    <span v-else-if="signatureVerified === false" class="text-error">{{
                      verificationError || 'Invalid'
                    }}</span>
                    <span v-else class="text-base-content/30">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
