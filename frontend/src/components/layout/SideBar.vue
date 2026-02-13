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
        <button @click="openSearch" class="btn btn-block btn-ghost justify-start">
          <Icon icon="material-symbols:search" class="w-6 h-6 mr-2" />
          Search Tools
        </button>
      </div>
      <SidebarMenu :tools-by-category="toolsByCategory" @tool-click="$emit('close')" />
    </aside>
  </div>

  <SearchModal v-model="isSearchOpen" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { toolsByCategory } from '../../tools';
import SidebarMenu from './SideBarMenu.vue';
import SearchModal from '../SearchModal.vue';

const isSearchOpen = ref(false);

const openSearch = () => {
  isSearchOpen.value = true;
};

const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    isSearchOpen.value = true;
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
});

defineProps<{
  isCollapsed: boolean;
}>();

defineEmits<{
  close: [];
}>();
</script>
