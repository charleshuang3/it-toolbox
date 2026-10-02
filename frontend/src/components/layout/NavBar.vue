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

    <div class="flex-none gap-2">
      <label class="swap swap-rotate btn btn-ghost btn-circle">
        <input type="checkbox" class="theme-controller" :checked="isDark" @change="toggleTheme" />
        <Icon icon="solar:sun-bold" class="swap-off w-6 h-6" />
        <Icon icon="solar:moon-bold" class="swap-on w-6 h-6" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { useTheme } from "../../composables/useTheme";

const { isDark, toggleTheme } = useTheme();

withDefaults(
  defineProps<{
    title?: string;
  }>(),
  {
    title: "Toolbox",
  },
);

defineEmits<{
  "toggle-sidebar": [];
}>();
</script>
