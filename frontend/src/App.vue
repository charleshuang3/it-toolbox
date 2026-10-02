<template>
  <div class="h-screen bg-base-200 flex flex-col overflow-hidden">
    <Navbar :title="title" @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed" />

    <div class="flex flex-1 overflow-hidden">
      <input id="main-drawer" type="checkbox" class="drawer-toggle" v-model="isSidebarOpen" />
      <Sidebar :is-collapsed="isSidebarCollapsed" @close="isSidebarOpen = false" />
      <main class="flex-1 p-6 overflow-y-auto">
        <router-view />
      </main>
    </div>

    <SearchModal v-model="isSearchOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import Navbar from "./components/layout/NavBar.vue";
import Sidebar from "./components/layout/SideBar.vue";
import SearchModal from "./components/SearchModal.vue";
import { useTheme } from "./composables/useTheme";

const { initTheme } = useTheme();

onMounted(() => {
  initTheme();
});

defineProps<{
  title: string;
}>();

const isSidebarOpen = ref(false);
const isSidebarCollapsed = ref(false);
const isSearchOpen = ref(false);

const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    event.preventDefault();
    isSearchOpen.value = true;
  }
};

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
});
</script>
