<template>
  <ul class="menu rounded-box p-2 w-full text-base-content">
    <li v-for="(tools, category) in toolsByCategory" :key="category">
      <details :open="isCategoryOpen(category)">
        <summary class="font-medium">{{ category }}</summary>
        <ul class="ml-3 p-2">
          <li v-for="tool in tools" :key="tool.path">
            <router-link
              :to="`/tools/${tool.path}`"
              @click="$emit('tool-click')"
              :class="{ 'menu-active': $route.path === `/tools/${tool.path}` }"
            >
              <Icon :icon="tool.icon" class="w-5 h-5" />
              {{ tool.name }}
            </router-link>
          </li>
        </ul>
      </details>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { Tool } from '../../tools/tools';

const props = defineProps<{
  toolsByCategory: Record<string, Tool[]>;
}>();

defineEmits<{
  'tool-click': [];
}>();

const route = useRoute();

function isCategoryOpen(category: string) {
  const tools = props.toolsByCategory[category];
  return tools.some((tool) => route.path === `/tools/${tool.path}`);
}
</script>
