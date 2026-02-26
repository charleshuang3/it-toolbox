<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import JsonEditorVue from 'json-editor-vue';
import { Mode } from 'vanilla-jsoneditor';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import {
  parseJwt,
  getHeaderFields,
  getPayloadFields,
  type FieldDisplay,
  type ParsedResult,
} from '../jwt-parser/jwt-utils';

interface JwtResponse {
  tokens: Record<string, string>;
}

// Time offset options
const timeOffsetOptions = [
  { label: '1 day ago', value: -86400000 },
  { label: '1 hour ago', value: -3600000 },
  { label: '10 min ago', value: -600000 },
  { label: 'now', value: 0 },
  { label: '10 min after', value: 600000 },
  { label: '1 hour after', value: 3600000 },
  { label: '1 day after', value: 86400000 },
];

// Input fields
const issuer = ref('(default)');
const issuedAtOffset = ref(0); // now
const expirationOffset = ref(600000); // 10 min after
const notBeforeOffset = ref(0); // now
const hmacKey = ref('this-is-a-safe-key');
const otherClaims = ref<Record<string, unknown>>({
  sub: 'sub-123',
  aur: ['aur-1', 'aur-2'],
});

// Output
const generatedTokens = ref<Record<string, string>>({});
const isLoading = ref(false);
const errorMessage = ref('');

// Modal state for viewing JWT details
const showViewModal = ref(false);
const selectedToken = ref('');
const selectedAlgorithm = ref('');
const parsedResult = ref<ParsedResult>({
  header: null,
  payload: null,
  error: null,
});
const headerFields = ref<FieldDisplay[]>([]);
const payloadFields = ref<FieldDisplay[]>([]);

// Computed values for dates
const issuedAt = computed(() => new Date(Date.now() + issuedAtOffset.value));
const expiration = computed(() => new Date(Date.now() + expirationOffset.value));
const notBefore = computed(() => new Date(Date.now() + notBeforeOffset.value));

// Computed values for display
const issuedAtTimestamp = computed(() => Math.floor(issuedAt.value.getTime() / 1000));
const expirationTimestamp = computed(() => Math.floor(expiration.value.getTime() / 1000));
const notBeforeTimestamp = computed(() => Math.floor(notBefore.value.getTime() / 1000));

async function generate() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch('/api/jwt/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hmacKey: hmacKey.value,
        claims: {
          ...otherClaims.value,
          iat: issuedAtTimestamp.value,
          exp: expirationTimestamp.value,
          nbf: notBeforeTimestamp.value,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate JWT');
    }

    const data: JwtResponse = await response.json();
    generatedTokens.value = data.tokens;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to generate JWT';
    generatedTokens.value = {};
  } finally {
    isLoading.value = false;
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function copyAll() {
  const tokens = Object.values(generatedTokens.value).join('\n');
  navigator.clipboard.writeText(tokens);
}

function viewToken(alg: string, token: string) {
  selectedAlgorithm.value = alg;
  selectedToken.value = token;
  parsedResult.value = parseJwt(token);
  headerFields.value = getHeaderFields(parsedResult.value.header);
  payloadFields.value = getPayloadFields(parsedResult.value.payload);
  showViewModal.value = true;
}

function closeViewModal() {
  showViewModal.value = false;
  selectedToken.value = '';
  selectedAlgorithm.value = '';
  parsedResult.value = { header: null, payload: null, error: null };
  headerFields.value = [];
  payloadFields.value = [];
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Input Section -->
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">JWT Claims</span>
          </label>

          <!-- JWT Claims Grid - responsive: stacked on mobile, same line on large screens -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Issuer -->
            <div class="form-control">
              <label class="label" for="issuer">
                <span class="label-text">Issuer (iss):</span>
              </label>
              <select id="issuer" v-model="issuer" class="select w-full">
                <option value="(default)">(default)</option>
              </select>
            </div>

            <!-- Issued At -->
            <div class="form-control">
              <label class="label" for="issued-at">
                <span class="label-text">Issued At (iat):</span>
              </label>
              <select id="issued-at" v-model="issuedAtOffset" class="select w-full">
                <option v-for="option in timeOffsetOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <!-- Expiration -->
            <div class="form-control">
              <label class="label" for="expiration">
                <span class="label-text">Expiration (exp):</span>
              </label>
              <select id="expiration" v-model="expirationOffset" class="select w-full">
                <option v-for="option in timeOffsetOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <!-- Not Before -->
            <div class="form-control">
              <label class="label" for="not-before">
                <span class="label-text">Not Before (nbf):</span>
              </label>
              <select id="not-before" v-model="notBeforeOffset" class="select w-full">
                <option v-for="option in timeOffsetOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- HMAC Key -->
        <div class="form-control">
          <label class="label" for="hmac-key">
            <span class="label-text font-semibold">HMAC Key</span>
          </label>
          <input
            id="hmac-key"
            v-model="hmacKey"
            type="text"
            class="input w-full"
            placeholder="Enter your secret key"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Other Claims</span>
          </label>
          <JsonEditorVue
            class="jse-theme-daisyui"
            v-model="otherClaims"
            :mode="Mode.text"
            :main-menu-bar="false"
            :navigation-bar="false"
            :status-bar="false"
          />
        </div>

        <!-- Generate button -->
        <div class="flex mt-1">
          <button class="btn btn-primary" :disabled="isLoading" @click="generate">
            <span v-if="isLoading" class="loading loading-spinner loading-sm"></span>
            <Icon v-else icon="solar:refresh-bold" class="h-5 w-5" />
            Generate
          </button>
        </div>

        <div class="divider"></div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="alert alert-error mb-4">
          <Icon icon="solar:danger-triangle-bold" class="h-5 w-5" />
          <span class="text-sm">{{ errorMessage }}</span>
        </div>

        <!-- Results -->
        <div v-if="Object.keys(generatedTokens).length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Generated Tokens</span>
            <button class="btn btn-sm btn-ghost" @click="copyAll">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy All
            </button>
          </div>
          <div v-for="(token, alg) in generatedTokens" :key="alg" class="flex items-center gap-2">
            <div class="flex-1">
              <div class="text-xs text-base-content/60 mb-1">{{ alg }}</div>
              <div class="flex items-center gap-2">
                <input type="text" :value="token" readonly class="input font-mono text-sm w-full" />
                <button class="btn btn-circle btn-sm" @click="viewToken(alg, token)">
                  <Icon icon="solar:eye-bold" class="h-4 w-4" />
                </button>
                <button class="btn btn-circle btn-sm" @click="copyToClipboard(token)">
                  <Icon icon="solar:copy-bold" class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center text-base-content/50 py-8">Click "Generate" to create JWT tokens</div>
      </div>
    </div>

    <!-- View JWT Modal -->
    <dialog :class="{ 'modal modal-open': showViewModal }">
      <div class="modal-box max-w-3xl">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="closeViewModal">
          <Icon icon="solar:close-circle-bold" class="h-5 w-5" />
        </button>
        <h3 class="font-bold text-lg mb-4">JWT Details - {{ selectedAlgorithm }}</h3>

        <!-- Error display -->
        <div v-if="parsedResult.error" class="alert alert-error mb-4">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ parsedResult.error }}</span>
        </div>

        <!-- Header table -->
        <div v-if="headerFields.length > 0" class="form-control mb-6">
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
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="closeViewModal">close</button>
      </form>
    </dialog>
  </div>
</template>
