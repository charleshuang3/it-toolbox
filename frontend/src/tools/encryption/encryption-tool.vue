<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { bytesToHex, hexToBytes, bytesToUtf8, utf8ToBytes, randomBytes } from '@noble/ciphers/utils.js';
import type { Cipher, AsyncCipher } from '@noble/ciphers/utils.js';
import { hashText } from '../../utils/hash';
import LabelWithActions from '../../components/LabelWithActions.vue';

type AlgoType = 'AES-GCM' | 'AES-CBC' | 'AES-CTR' | 'ChaCha20-Poly1305';

// Algorithm configuration
const algoConfig: Record<AlgoType, { nonceSize: number; keySize: number }> = {
  'AES-GCM': { nonceSize: 12, keySize: 32 }, // key size 32 bytes means 256 bits
  'AES-CBC': { nonceSize: 16, keySize: 32 },
  'AES-CTR': { nonceSize: 12, keySize: 32 },
  'ChaCha20-Poly1305': { nonceSize: 12, keySize: 32 },
};

// Dynamic import for AES-GCM cipher
async function getGcm(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { gcm } = await import('@noble/ciphers/webcrypto.js');
    return gcm(key, nonce);
  }
  const { gcm } = await import('@noble/ciphers/aes.js');
  return gcm(key, nonce);
}

// Dynamic import for AES-CBC cipher
async function getCbc(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { cbc } = await import('@noble/ciphers/webcrypto.js');
    return cbc(key, nonce);
  }
  const { cbc } = await import('@noble/ciphers/aes.js');
  return cbc(key, nonce);
}

// Dynamic import for AES-CTR cipher
async function getCtr(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { ctr } = await import('@noble/ciphers/webcrypto.js');
    return ctr(key, nonce);
  }
  const { ctr } = await import('@noble/ciphers/aes.js');
  return ctr(key, nonce);
}

// Dynamic import for ChaCha20-Poly1305 (no webcrypto version, always use pure JS)
async function getChacha20poly1305(key: Uint8Array, nonce: Uint8Array): Promise<Cipher> {
  const { chacha20poly1305 } = await import('@noble/ciphers/chacha.js');
  return chacha20poly1305(key, nonce);
}

// Derive a key from the secret using SHA-256 hash
async function deriveKey(secret: string, keySize: number): Promise<Uint8Array> {
  const hashArray = await hashText('sha256', secret);
  return hashArray.slice(0, keySize);
}

// Generate a random nonce using dynamic import
async function generateNonce(size: number): Promise<Uint8Array> {
  return randomBytes(size);
}

// Generate a zero-filled nonce
function zeroNonce(size: number): Uint8Array {
  return new Uint8Array(size);
}

// Encrypt function
async function encrypt(plaintext: string, secret: string, algorithm: AlgoType, nonceHex?: string): Promise<string> {
  const config = algoConfig[algorithm];
  const key = await deriveKey(secret, config.keySize);
  const nonce = nonceHex ? hexToBytes(nonceHex) : zeroNonce(config.nonceSize);

  const plaintextBytes = utf8ToBytes(plaintext);
  let ciphertext: Uint8Array;

  switch (algorithm) {
    case 'AES-GCM': {
      const cipher = await getGcm(key, nonce);
      ciphertext = await cipher.encrypt(plaintextBytes);
      break;
    }
    case 'AES-CBC': {
      const cipher = await getCbc(key, nonce);
      ciphertext = await cipher.encrypt(plaintextBytes);
      break;
    }
    case 'AES-CTR': {
      const cipher = await getCtr(key, nonce);
      ciphertext = await cipher.encrypt(plaintextBytes);
      break;
    }
    case 'ChaCha20-Poly1305': {
      const cipher = await getChacha20poly1305(key, nonce);
      ciphertext = cipher.encrypt(plaintextBytes);
      break;
    }
  }

  return bytesToHex(ciphertext);
}

// Decrypt function
async function decrypt(ciphertextHex: string, secret: string, algorithm: AlgoType, nonceHex: string): Promise<string> {
  const config = algoConfig[algorithm];
  const key = await deriveKey(secret, config.keySize);
  const nonce = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);

  let plaintext: Uint8Array;

  switch (algorithm) {
    case 'AES-GCM': {
      const cipher = await getGcm(key, nonce);
      plaintext = await cipher.decrypt(ciphertext);
      break;
    }
    case 'AES-CBC': {
      const cipher = await getCbc(key, nonce);
      plaintext = await cipher.decrypt(ciphertext);
      break;
    }
    case 'AES-CTR': {
      const cipher = await getCtr(key, nonce);
      plaintext = await cipher.decrypt(ciphertext);
      break;
    }
    case 'ChaCha20-Poly1305': {
      const cipher = await getChacha20poly1305(key, nonce);
      plaintext = cipher.decrypt(ciphertext);
      break;
    }
  }

  return bytesToUtf8(plaintext);
}

// Encrypt section
const encryptInput = ref('Lorem ipsum dolor sit amet');
const encryptAlgo = ref<AlgoType>('AES-GCM');
const encryptSecret = ref('my secret key');
const encryptNonce = ref('');
const encryptOutput = ref('');
const encryptLoading = ref(false);

async function doEncrypt() {
  if (!encryptInput.value || !encryptSecret.value) {
    encryptOutput.value = '';
    return;
  }
  encryptLoading.value = true;
  try {
    encryptOutput.value = await encrypt(
      encryptInput.value,
      encryptSecret.value,
      encryptAlgo.value,
      encryptNonce.value || undefined,
    );
  } catch (e) {
    encryptOutput.value = '';
    console.error(e);
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
const decryptInput = ref('');
const decryptAlgo = ref<AlgoType>('AES-GCM');
const decryptSecret = ref('my secret key');
const decryptNonce = ref('');
const decryptError = ref('');
const decryptOutput = ref('');
const decryptLoading = ref(false);

async function doDecrypt() {
  if (!decryptInput.value || !decryptSecret.value || !decryptNonce.value) {
    decryptError.value = '';
    decryptOutput.value = '';
    return;
  }
  decryptLoading.value = true;
  try {
    const result = await decrypt(decryptInput.value, decryptSecret.value, decryptAlgo.value, decryptNonce.value);
    if (!result) {
      decryptError.value = 'Unable to decrypt your text. Check your secret key, nonce, and algorithm.';
      decryptOutput.value = '';
    } else {
      decryptError.value = '';
      decryptOutput.value = result;
    }
  } catch {
    decryptError.value = 'Unable to decrypt your text. Check your secret key, nonce, and algorithm.';
    decryptOutput.value = '';
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
    decryptNonce.value = encryptNonce.value || bytesToHex(zeroNonce(algoConfig[encryptAlgo.value].nonceSize));
  }
}

// Generate random nonce for encryption
async function generateEncryptNonce() {
  const config = algoConfig[encryptAlgo.value];
  encryptNonce.value = bytesToHex(await generateNonce(config.nonceSize));
}

// Clear nonce field
function clearEncryptNonce() {
  encryptNonce.value = '';
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
              <button class="btn btn-xs btn-ghost" @click="generateEncryptNonce" title="Generate random nonce">
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
              :placeholder="`Leave empty to use 0 (${algoConfig[encryptAlgo].nonceSize} bytes)`"
            />
          </div>

          <!-- Output -->
          <div class="form-control">
            <LabelWithActions label="Encrypted text (hex)">
              <button v-if="encryptOutput" class="btn btn-xs btn-ghost" @click="copyToClipboard(encryptOutput)">
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
              <button v-if="decryptOutput" class="btn btn-xs btn-ghost" @click="copyToClipboard(decryptOutput)">
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
