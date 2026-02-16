<script setup lang="ts">
import { computed, defineAsyncComponent, ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { allTools } from '../tools';

const props = defineProps<{
  name: string;
}>();

const tool = computed(() => {
  return allTools.find((t) => t.path === props.name);
});

// Dynamic component loading based on tool path
const toolComponent = computed(() => {
  const t = tool.value;
  if (!t) return null;
  return defineAsyncComponent(t.component);
});

// Browser support warning
const browserWarning = ref('');

onMounted(() => {
  const t = tool.value;
  if (t?.checkBrowserSupport) {
    const result = t.checkBrowserSupport();
    if (!result.isSupported) {
      browserWarning.value = result.warningMessage;
    }
  }
});
</script>

<template>
  <div class="space-y-4">
    <!-- Tool not found -->
    <div v-if="!tool" class="alert alert-error">
      <Icon icon="material-symbols:error" class="w-6 h-6" />
      <span>Tool "{{ name }}" not found</span>
    </div>

    <!-- Tool content -->
    <template v-else>
      <div class="flex justify-center flex-row">
        <div class="max-w-200 lg:w-200 sm:w-full">
          <div class="flex items-center gap-3 mb-4">
            <Icon :icon="tool.icon" class="w-8 h-8 text-primary" />
            <div>
              <h1 class="text-2xl font-bold">{{ tool.name }}</h1>
              <p class="text-sm opacity-70">{{ tool.description }}</p>
            </div>
          </div>

          <!-- Browser support warning -->
          <div v-if="browserWarning" class="alert alert-warning mb-4">
            <Icon icon="solar:danger-triangle-bold" class="h-5 w-5" />
            <span>{{ browserWarning }}</span>
          </div>

          <component :is="toolComponent" v-if="toolComponent" />
        </div>
      </div>
    </template>
  </div>
</template>
