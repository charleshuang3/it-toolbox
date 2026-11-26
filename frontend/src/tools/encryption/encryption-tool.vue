<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { bytesToHex, randomBytes } from "@noble/ciphers/utils.js";
import { algoConfig, encrypt, decrypt, PBKDF2_ITERATIONS } from "./crypto";
import type { AlgoType } from "./crypto";
import LabelWithActions from "../../components/LabelWithActions.vue";

// Encrypt section
const encryptInput = ref("Lorem ipsum dolor sit amet");
const encryptAlgo = ref<AlgoType>("AES-GCM");
const encryptSecret = ref("my secret key");
const encryptNonce = ref("");
const encryptOutput = ref("");
const encryptUsedNonce = ref("");
const encryptError = ref("");
const encryptLoading = ref(false);

async function doEncrypt() {
  if (!encryptInput.value || !encryptSecret.value) {
    encryptOutput.value = "";
    encryptUsedNonce.value = "";
    encryptError.value = "";
    return;
  }
  encryptLoading.value = true;
  try {
    const result = await encrypt(
      encryptInput.value,
      encryptSecret.value,
      encryptAlgo.value,
      encryptNonce.value || undefined,
    );
    encryptOutput.value = result.ciphertext;
    encryptUsedNonce.value = result.nonce;
    encryptError.value = "";
  } catch (e) {
    encryptOutput.value = "";
    encryptUsedNonce.value = "";
    encryptError.value = e instanceof Error ? e.message : String(e);
  } finally {
    encryptLoading.value = false;
  }
}

watch(
  [encryptInput, encryptAlgo, encryptSecret, encryptNonce],
  () => {
    doEncrypt();
  },
  { immediate: true },
);

// Decrypt section
const decryptInput = ref("");
const decryptAlgo = ref<AlgoType>("AES-GCM");
const decryptSecret = ref("my secret key");
const decryptNonce = ref("");
const decryptError = ref("");
const decryptOutput = ref("");
const decryptLoading = ref(false);

async function doDecrypt() {
  if (!decryptInput.value || !decryptSecret.value || !decryptNonce.value) {
    decryptError.value = "";
    decryptOutput.value = "";
    return;
  }
  decryptLoading.value = true;
  try {
    const result = await decrypt(
      decryptInput.value,
      decryptSecret.value,
      decryptAlgo.value,
      decryptNonce.value,
    );
    if (!result) {
      decryptError.value =
        "Unable to decrypt your text. Check your secret key, nonce, and algorithm.";
      decryptOutput.value = "";
    } else {
      decryptError.value = "";
      decryptOutput.value = result;
    }
  } catch (e) {
    decryptError.value =
      e instanceof Error && e.message.startsWith("Nonce")
        ? e.message
        : "Unable to decrypt your text. Check your secret key, nonce, and algorithm.";
    decryptOutput.value = "";
  } finally {
    decryptLoading.value = false;
  }
}

watch([decryptInput, decryptAlgo, decryptSecret, decryptNonce], () => {
  doDecrypt();
});

// Copy to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Swap encrypt output to decrypt input
function swapToDecrypt() {
  if (encryptOutput.value) {
    decryptInput.value = encryptOutput.value;
    decryptAlgo.value = encryptAlgo.value;
    decryptSecret.value = encryptSecret.value;
    decryptNonce.value = encryptUsedNonce.value;
  }
}

// Generate random nonce for encryption
async function generateEncryptNonce() {
  const config = algoConfig[encryptAlgo.value];
  encryptNonce.value = bytesToHex(randomBytes(config.nonceSize));
}

// Clear nonce field
function clearEncryptNonce() {
  encryptNonce.value = "";
}

const algoOptions = Object.keys(algoConfig) as AlgoType[];
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Encrypt Section -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Icon icon="solar:lock-bold" class="h-5 w-5" />
            Encrypt
          </h3>

          <!-- Input text -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Your text</span>
            </label>
            <textarea
              v-model="encryptInput"
              class="textarea textarea-bordered font-mono text-sm w-full"
              rows="3"
              placeholder="Enter text to encrypt"
            ></textarea>
          </div>

          <!-- Algorithm -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Algorithm</span>
            </label>
            <select v-model="encryptAlgo" class="select select-bordered w-full">
              <option v-for="algo in algoOptions" :key="algo" :value="algo">{{ algo }}</option>
            </select>
          </div>

          <!-- Secret key -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Secret key</span>
            </label>
            <input
              v-model="encryptSecret"
              type="text"
              class="input input-bordered w-full"
              placeholder="Enter secret key"
            />
            <p class="text-xs text-base-content/60 mt-1">
              The key is derived with PBKDF2-SHA256 ({{ PBKDF2_ITERATIONS.toLocaleString() }}
              iterations) and a fixed public salt. Use a long, random secret.
            </p>
          </div>

          <!-- Nonce (optional) -->
          <div class="form-control">
            <LabelWithActions label="Nonce (optional, hex)">
              <button
                v-if="encryptNonce"
                class="btn btn-xs btn-ghost"
                @click="copyToClipboard(encryptNonce)"
                title="Copy nonce"
              >
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
                Copy
              </button>
              <button
                class="btn btn-xs btn-ghost"
                @click="generateEncryptNonce"
                title="Generate random nonce"
              >
                <Icon icon="solar:refresh-bold" class="h-3 w-3" />
                Generate
              </button>
              <button class="btn btn-xs btn-ghost" @click="clearEncryptNonce" title="Clear nonce">
                <Icon icon="solar:trash-bin-trash-bold" class="h-3 w-3" />
                Clear
              </button>
            </LabelWithActions>
            <input
              v-model="encryptNonce"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              :placeholder="`Leave empty to generate a random nonce (${algoConfig[encryptAlgo].nonceSize} bytes)`"
            />
          </div>

          <!-- Nonce used -->
          <div v-if="encryptUsedNonce" class="form-control">
            <LabelWithActions label="Nonce used (hex, needed for decryption)">
              <button
                class="btn btn-xs btn-ghost"
                @click="copyToClipboard(encryptUsedNonce)"
                title="Copy nonce"
              >
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
                Copy
              </button>
            </LabelWithActions>
            <input
              :value="encryptUsedNonce"
              type="text"
              readonly
              class="input input-bordered w-full font-mono text-sm"
            />
          </div>

          <!-- Error message -->
          <div v-if="encryptError" class="alert alert-error text-sm">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
            <span>{{ encryptError }}</span>
          </div>

          <!-- Output -->
          <div class="form-control">
            <LabelWithActions label="Encrypted text (hex)">
              <button
                v-if="encryptOutput"
                class="btn btn-xs btn-ghost"
                @click="copyToClipboard(encryptOutput)"
              >
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                Copy
              </button>
            </LabelWithActions>
            <textarea
              :value="encryptOutput"
              class="textarea textarea-bordered font-mono text-sm w-full"
              rows="2"
              readonly
              placeholder="Encrypted text will appear here"
            ></textarea>
            <button v-if="encryptOutput" class="btn btn-sm btn-outline mt-2" @click="swapToDecrypt">
              <Icon icon="solar:arrow-down-bold" class="h-4 w-4" />
              Use for decryption
            </button>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Decrypt Section -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Icon icon="solar:lock-unlocked-bold" class="h-5 w-5" />
            Decrypt
          </h3>

          <!-- Input text -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Your encrypted text (hex)</span>
            </label>
            <textarea
              v-model="decryptInput"
              class="textarea textarea-bordered font-mono text-sm w-full"
              rows="2"
              placeholder="Enter encrypted text in hex format"
            ></textarea>
          </div>

          <!-- Algorithm -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Algorithm</span>
            </label>
            <select v-model="decryptAlgo" class="select select-bordered w-full">
              <option v-for="algo in algoOptions" :key="algo" :value="algo">{{ algo }}</option>
            </select>
          </div>

          <!-- Secret key -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Secret key</span>
            </label>
            <input
              v-model="decryptSecret"
              type="text"
              class="input input-bordered w-full"
              placeholder="Enter secret key"
            />
          </div>

          <!-- Nonce (required for decryption) -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Nonce (hex, required)</span>
            </label>
            <input
              v-model="decryptNonce"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              placeholder="Enter nonce used during encryption"
            />
          </div>

          <!-- Error message -->
          <div v-if="decryptError" class="alert alert-error text-sm">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
            <span>{{ decryptError }}</span>
          </div>

          <!-- Output -->
          <div class="form-control">
            <LabelWithActions label="Decrypted text">
              <button
                v-if="decryptOutput"
                class="btn btn-xs btn-ghost"
                @click="copyToClipboard(decryptOutput)"
              >
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                Copy
              </button>
            </LabelWithActions>
            <textarea
              :value="decryptOutput"
              class="textarea textarea-bordered font-mono text-sm w-full"
              rows="3"
              readonly
              placeholder="Decrypted text will appear here"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
