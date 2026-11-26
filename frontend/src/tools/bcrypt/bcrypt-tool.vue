<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import { hash, compareSync } from "bcrypt-ts";
import LabelWithActions from "../../components/LabelWithActions.vue";

const input = ref("");
const saltCount = ref(10);
const minCost = 4;
const maxCost = 14;
const hashed = ref("");
const hashError = ref("");
const hashing = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let runId = 0;

async function doHash() {
  const id = ++runId;
  if (!input.value) {
    hashed.value = "";
    hashError.value = "";
    hashing.value = false;
    return;
  }
  const cost = Math.min(maxCost, Math.max(minCost, Math.round(Number(saltCount.value)) || 10));
  hashing.value = true;
  try {
    const result = await hash(input.value, cost);
    if (id !== runId) return;
    hashed.value = result;
    hashError.value = "";
  } catch (e) {
    if (id !== runId) return;
    hashed.value = "";
    hashError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (id === runId) hashing.value = false;
  }
}

watch([input, saltCount], () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doHash, 400);
});

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  runId++;
});

const compareString = ref("");
const compareHash = ref("");
const compareMatch = computed(() => {
  if (!compareString.value || !compareHash.value) return false;
  try {
    return compareSync(compareString.value, compareHash.value);
  } catch {
    return false;
  }
});

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function clearInput() {
  input.value = "";
}

function clearCompareString() {
  compareString.value = "";
}

function clearCompareHash() {
  compareHash.value = "";
}

// Swap hash output to compare hash input
function swapToVerify() {
  if (input.value) {
    compareString.value = input.value;
  }

  if (hashed.value) {
    compareHash.value = hashed.value;
  }
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Hash Section -->
        <h3 class="text-lg font-semibold">Hash</h3>

        <!-- Input string -->
        <div class="form-control">
          <LabelWithActions label="Your string">
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <input
            v-model="input"
            type="text"
            placeholder="Your string to bcrypt..."
            class="input input-bordered w-full"
          />
        </div>

        <!-- Salt count -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Salt rounds</span>
          </label>
          <input
            v-model.number="saltCount"
            type="number"
            class="input input-bordered w-full"
            :min="minCost"
            :max="maxCost"
          />
        </div>

        <div v-if="hashError" class="alert alert-error text-sm">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ hashError }}</span>
        </div>

        <!-- Hashed result -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Hashed result{{ hashing ? " (hashing...)" : "" }}</span>
          </label>
          <div class="flex gap-2">
            <input
              :value="hashed"
              type="text"
              readonly
              class="input input-bordered font-mono text-sm grow"
            />
            <button v-if="hashed" class="btn btn-circle" @click="copyToClipboard(hashed)">
              <Icon icon="solar:copy-bold" class="h-5 w-5" />
            </button>
          </div>
          <button v-if="hashed" class="btn btn-sm btn-outline mt-2" @click="swapToVerify">
            <Icon icon="solar:arrow-down-bold" class="h-4 w-4" />
            Use for verify
          </button>
        </div>

        <div class="divider"></div>

        <!-- Compare Section -->
        <h3 class="text-lg font-semibold">Compare string with hash</h3>

        <!-- Compare string -->
        <div class="form-control">
          <LabelWithActions label="Your string">
            <button
              class="btn btn-ghost btn-sm"
              :disabled="!compareString"
              @click="clearCompareString"
            >
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <input
            v-model="compareString"
            type="text"
            placeholder="Your string to compare..."
            class="input input-bordered w-full"
          />
        </div>

        <!-- Compare hash -->
        <div class="form-control">
          <LabelWithActions label="Your hash">
            <button class="btn btn-ghost btn-sm" :disabled="!compareHash" @click="clearCompareHash">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <input
            v-model="compareHash"
            type="text"
            placeholder="Your hash to compare..."
            class="input input-bordered w-full font-mono text-sm"
          />
        </div>

        <!-- Compare result -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Do they match?</span>
          </label>
          <div
            class="text-lg font-semibold"
            :class="
              compareMatch
                ? 'text-success'
                : compareString && compareHash
                  ? 'text-error'
                  : 'text-base-content/50'
            "
          >
            <span v-if="compareString && compareHash">
              <Icon
                :icon="compareMatch ? 'solar:check-circle-bold' : 'solar:close-circle-bold'"
                class="h-6 w-6 inline-block"
              />
              {{ compareMatch ? "Yes" : "No" }}
            </span>
            <span v-else>Enter string and hash to compare</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
