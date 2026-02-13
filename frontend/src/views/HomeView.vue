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
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="tool in toolsByCategory[category]"
          :key="tool.path"
          class="card bg-base-100 shadow-md hover:shadow-xl transition-shadow cursor-pointer"
          @click="navigateToTool(tool.path)"
        >
          <div class="card-body">
            <div class="flex items-center gap-3">
              <Icon :icon="tool.icon" class="w-8 h-8 text-primary" />
              <h3 class="card-title text-lg">{{ tool.name }}</h3>
            </div>
            <p class="text-sm opacity-70">{{ tool.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
