<template>
  <div class="min-h-screen bg-base-200 flex flex-col">
    <Navbar @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed" />

    <div class="flex flex-1 overflow-hidden">
      <input id="main-drawer" type="checkbox" class="drawer-toggle" v-model="isSidebarOpen" />
      <Sidebar :is-collapsed="isSidebarCollapsed" @close="isSidebarOpen = false" />
      <main class="flex-1 p-6 overflow-y-auto">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Navbar from './components/layout/Navbar.vue';
import Sidebar from './components/layout/Sidebar.vue';

const isSidebarOpen = ref(false);
const isSidebarCollapsed = ref(false);
</script>
