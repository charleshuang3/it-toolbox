<template>
  <Transition appear name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" @click="close">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        class="relative w-full max-w-2xl bg-base-100 rounded-lg shadow-2xl border border-base-200 overflow-hidden"
        @click.stop
      >
        <div class="p-4 border-b border-base-200">
          <div class="relative">
            <label class="input w-full">
              <Icon icon="tabler:search" />
              <input
                v-model="searchQuery"
                ref="searchInput"
                type="text"
                placeholder="Type to search tools... (Esc to close)"
                class="w-full input-bordered text-lg"
                autofocus
                @keydown="handleKeyDown"
              />
            </label>
          </div>
        </div>

        <div class="max-h-[50vh] overflow-y-auto">
          <div v-if="!searchQuery" class="p-8 text-center text-base-content/60">
            <Icon icon="material-symbols:search" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Type to search for tools</p>
          </div>
          <div v-else-if="filteredTools.length === 0" class="p-8 text-center text-base-content/60">
            <Icon icon="material-symbols:search-off" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No tools found for "{{ searchQuery }}"</p>
          </div>

          <div v-else class="divide-y divide-base-200">
            <div
              v-for="tool in filteredTools"
              :key="tool.path"
              @click="selectTool(tool)"
              class="p-4 hover:bg-base-200 cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center">
                  <Icon :icon="tool.icon" class="w-6 h-6" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold truncate" v-html="highlightText(tool.name)"></h3>
                  <p class="text-sm text-base-content/60 line-clamp-2" v-html="highlightText(tool.description)"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { allTools } from '../tools';
import type { Tool } from '../tools/tools';

interface Props {
  modelValue: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const router = useRouter();
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const filteredTools = computed(() => {
  if (!searchQuery.value) {
    return [];
  }

  const query = searchQuery.value.toLowerCase().trim();

  return allTools
    .map((tool) => {
      const nameMatch = tool.name.toLowerCase().includes(query) ? 2 : 0;
      const descriptionMatch = tool.description.toLowerCase().includes(query) ? 1 : 0;
      const score = nameMatch + descriptionMatch;
      return { ...tool, score };
    })
    .filter((tool) => tool.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });
});

const highlightText = (text: string) => {
  if (!searchQuery.value) {
    return text;
  }

  const query = searchQuery.value.toLowerCase();
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return text.replace(regex, '<mark class="bg-primary text-primary-content px-0.5 rounded">$1</mark>');
};

const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const close = () => {
  isOpen.value = false;
  searchQuery.value = '';
};

const selectTool = (tool: Tool) => {
  router.push(`/tools/${tool.path}`);
  close();
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close();
  }
};

watch(isOpen, (newVal) => {
  if (newVal) {
    searchQuery.value = '';
    nextTick(() => {
      searchInput.value?.focus();
    });
  }
});
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

.modal-enter-to .relative,
.modal-leave-from .relative {
  transform: scale(1) translateY(0);
  opacity: 1;
}
</style>
