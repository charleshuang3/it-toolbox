<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { ulid, decodeTime } from 'ulid';

const count = ref(1);
const results = ref<string[]>([]);
const showTimestamp = ref(false);

const maxCount = 20;

function generate() {
  results.value = [];

  // Clamp count to valid range
  if (count.value < 1) {
    count.value = 1;
  } else if (count.value > maxCount) {
    count.value = maxCount;
  }

  for (let i = 0; i < count.value; i++) {
    results.value.push(ulid());
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function copyAll() {
  navigator.clipboard.writeText(results.value.join('\n'));
}

function getTimestamp(ulidStr: string): string {
  try {
    const timestamp = decodeTime(ulidStr);
    return new Date(timestamp).toISOString();
  } catch {
    return 'Invalid';
  }
}

const ulidInfo = computed(() => {
  return 'ULID is a 128-bit lexicographically sortable identifier. It encodes a timestamp (48 bits) and randomness (80 bits), making it sortable by generation time like UUID v7 but with better encoding efficiency.';
});
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Info -->
        <div class="alert alert-info text-sm">
          <Icon icon="solar:info-circle-bold" class="h-5 w-5" />
          <span>{{ ulidInfo }}</span>
        </div>

        <!-- Count input -->
        <div class="form-control flex gap-1">
          <label class="label">
            <span class="label-text">Number of ULIDs</span>
          </label>
          <input
            v-model.number="count"
            type="number"
            class="input input-bordered validator"
            required
            min="1"
            :max="maxCount"
            :title="`Must be between 1 to ${maxCount}`"
          />
          <p class="validator-hint">Must be between 1 to {{ maxCount }}</p>
        </div>

        <!-- Show timestamp toggle -->
        <div class="form-control">
          <label class="label cursor-pointer justify-start gap-2">
            <input v-model="showTimestamp" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text">Show decoded timestamp</span>
          </label>
        </div>

        <!-- Generate button -->
        <div class="flex mt-1">
          <button class="btn btn-primary" @click="generate">
            <Icon icon="solar:refresh-bold" class="h-5 w-5" />
            Generate
          </button>
        </div>

        <div class="divider"></div>

        <!-- Results -->
        <div v-if="results.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Results</span>
            <button v-if="results.length > 1" class="btn btn-sm btn-ghost" @click="copyAll">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy All
            </button>
          </div>
          <div v-for="(ulidStr, index) in results" :key="index" class="flex items-center gap-2">
            <div class="flex-1 flex gap-1">
              <input type="text" :value="ulidStr" readonly class="input input-bordered font-mono text-sm grow" />
              <div v-if="showTimestamp" class="text-xs text-base-content/60">
                {{ getTimestamp(ulidStr) }}
              </div>
            </div>
            <button class="btn btn-circle btn-sm" @click="copyToClipboard(ulidStr)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div v-else class="text-center text-base-content/50 py-8">Click "Generate" to create ULIDs</div>
      </div>
    </div>
  </div>
</template>
