<template>
  <!-- Desktop Sidebar -->
  <aside
    v-show="!isCollapsed"
    class="hidden lg:block w-64 shrink-0 bg-base-100 border-r border-base-200 overflow-y-auto"
  >
    <SidebarMenu :tools-by-category="toolsByCategory" />
  </aside>

  <!-- Mobile Drawer -->
  <div class="drawer-side lg:hidden z-40">
    <label for="main-drawer" class="drawer-overlay"></label>
    <aside class="bg-base-100 w-80 min-h-full flex flex-col border-r border-base-200">
      <div class="p-4 border-b border-base-200">
        <input type="text" placeholder="Search..." class="input input-bordered w-full" />
      </div>
      <SidebarMenu :tools-by-category="toolsByCategory" @tool-click="$emit('close')" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { toolsByCategory } from '../../tools';
import SidebarMenu from './SidebarMenu.vue';

defineProps<{
  isCollapsed: boolean;
}>();

defineEmits<{
  close: [];
}>();
</script>
