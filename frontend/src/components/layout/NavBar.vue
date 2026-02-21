<template>
  <div class="navbar bg-base-100 sticky top-0 z-30 shadow-sm gap-2 shrink-0">
    <div class="flex-none">
      <label for="main-drawer" class="btn btn-square btn-ghost lg:hidden">
        <Icon icon="material-symbols:menu-rounded" class="w-6 h-6" />
      </label>
      <button @click="$emit('toggle-sidebar')" class="btn btn-square btn-ghost hidden lg:flex">
        <Icon icon="material-symbols:menu-rounded" class="w-6 h-6" />
      </button>
    </div>

    <div class="flex-1 font-bold text-xl">
      <router-link to="/">{{ title }}</router-link>
    </div>

    <div class="flex-none hidden md:block">
      <button @click="openSearch" class="btn btn-ghost">
        <Icon icon="material-symbols:search" class="w-6 h-6" />
        Search
        <span class="text-xs text-base-content/50">(Ctrl+K)</span>
      </button>
    </div>

    <div class="flex-none gap-2">
      <label class="swap swap-rotate btn btn-ghost btn-circle">
        <input type="checkbox" class="theme-controller" :checked="isDark" @change="toggleTheme" />
        <Icon icon="solar:sun-bold" class="swap-off w-6 h-6" />
        <Icon icon="solar:moon-bold" class="swap-on w-6 h-6" />
      </label>
    </div>
  </div>

  <SearchModal v-model="isSearchOpen" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import SearchModal from '../SearchModal.vue';
import { useTheme } from '../../composables/useTheme';

const { isDark, toggleTheme } = useTheme();

withDefaults(
  defineProps<{
    title?: string;
  }>(),
  {
    title: 'Toolbox',
  },
);

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

defineEmits<{
  'toggle-sidebar': [];
}>();
</script>
