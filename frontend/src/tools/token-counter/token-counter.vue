<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { estimateTokenCount } from 'tokenx';
import LabelWithActions from '../../components/LabelWithActions.vue';

const inputText = ref('');
const result = computed(() => {
  if (!inputText.value.trim()) {
    return null;
  }
  return estimateTokenCount(inputText.value);
});

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function clearInput() {
  inputText.value = '';
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="form-control">
          <LabelWithActions label="Input text to count tokens:">
            <button class="btn btn-ghost btn-sm" :disabled="!inputText" @click="clearInput">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            id="input-text"
            v-model="inputText"
            class="textarea textarea-bordered h-48 w-full"
            placeholder="Your text to count tokens..."
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="result !== null" class="mt-4">
          <div class="text-sm text-base-content/60 mb-1">Estimated Token Count</div>
          <div class="text-3xl font-bold text-primary">
            {{ formatNumber(result) }}
          </div>
        </div>
        <div v-else class="text-center text-base-content/50 py-8">Enter text above to estimate token count</div>
      </div>
    </div>
  </div>
</template>
