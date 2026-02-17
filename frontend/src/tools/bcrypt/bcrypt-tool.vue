<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { hashSync, compareSync } from 'bcrypt-ts';

const input = ref('');
const saltCount = ref(10);
const hashed = computed(() => (input.value ? hashSync(input.value, saltCount.value) : ''));

const compareString = ref('');
const compareHash = ref('');
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
  input.value = '';
}

function clearCompareString() {
  compareString.value = '';
}

function clearCompareHash() {
  compareHash.value = '';
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
          <label class="label justify-between w-full">
            <span class="label-text">Your string</span>
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
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
          <input v-model.number="saltCount" type="number" class="input input-bordered w-full" min="0" max="20" />
        </div>

        <!-- Hashed result -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Hashed result</span>
          </label>
          <div class="flex gap-2">
            <input :value="hashed" type="text" readonly class="input input-bordered font-mono text-sm grow" />
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
          <label class="label justify-between w-full">
            <span class="label-text">Your string</span>
            <button class="btn btn-ghost btn-sm" :disabled="!compareString" @click="clearCompareString">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
          <input
            v-model="compareString"
            type="text"
            placeholder="Your string to compare..."
            class="input input-bordered w-full"
          />
        </div>

        <!-- Compare hash -->
        <div class="form-control">
          <label class="label justify-between w-full">
            <span class="label-text">Your hash</span>
            <button class="btn btn-ghost btn-sm" :disabled="!compareHash" @click="clearCompareHash">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </label>
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
              compareMatch ? 'text-success' : compareString && compareHash ? 'text-error' : 'text-base-content/50'
            "
          >
            <span v-if="compareString && compareHash">
              <Icon
                :icon="compareMatch ? 'solar:check-circle-bold' : 'solar:close-circle-bold'"
                class="h-6 w-6 inline-block"
              />
              {{ compareMatch ? 'Yes' : 'No' }}
            </span>
            <span v-else>Enter string and hash to compare</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
