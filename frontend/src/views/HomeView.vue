<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { toolsByCategory } from '../tools';

const router = useRouter();

const categories = computed(() => {
  return Object.keys(toolsByCategory).sort();
});

function navigateToTool(toolPath: string) {
  router.push(`/tools/${toolPath}`);
}
</script>

<template>
  <div class="space-y-6">
    <div v-for="category in categories" :key="category">
      <h2 class="text-xl font-bold mb-4">{{ category }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        <div
          v-for="tool in toolsByCategory[category]"
          :key="tool.path"
          class="card bg-base-100 card-border-1 cursor-pointer border border-gray-300 hover:border-primary min-w-0"
          @click="navigateToTool(tool.path)"
        >
          <div class="card-body p-4">
            <div class="flex items-center gap-3 min-w-0">
              <Icon :icon="tool.icon" class="w-8 h-8 shrink-0 text-primary" />
              <h3 class="card-title text-base line-clamp-1 break-all">{{ tool.name }}</h3>
            </div>
            <p class="text-sm opacity-70 line-clamp-2">{{ tool.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
