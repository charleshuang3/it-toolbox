<template>
  <div class="min-h-screen bg-base-200 flex flex-col">
    <!-- Navbar -->
    <div class="navbar bg-base-100 sticky top-0 z-30 shadow-sm gap-2 shrink-0">
      <div class="flex-none">
        <label for="main-drawer" class="btn btn-square btn-ghost lg:hidden">
          <Icon icon="material-symbols:menu-rounded" class="w-6 h-6" />
        </label>
        <button @click="isSidebarCollapsed = !isSidebarCollapsed" class="btn btn-square btn-ghost hidden lg:flex">
          <Icon icon="material-symbols:menu-rounded" class="w-6 h-6" />
        </button>
      </div>

      <div class="flex-1 px-2 mx-2 font-bold text-xl">MyWebApp</div>

      <div class="flex-none hidden md:block">
        <input type="text" placeholder="Search..." class="input input-bordered w-24 md:w-auto" />
      </div>

      <div class="flex-none gap-2">
        <label class="swap swap-rotate btn btn-ghost btn-circle">
          <input type="checkbox" class="theme-controller" value="synthwave" />
          <Icon icon="solar:sun-bold" class="swap-off w-6 h-6" />
          <Icon icon="solar:moon-bold" class="swap-on w-6 h-6" />
        </label>
        <div class="dropdown dropdown-end">
          <label tabindex="0" class="btn btn-ghost btn-circle avatar">
            <div class="w-10 rounded-full bg-neutral text-neutral-content">
              <span>User</span>
            </div>
          </label>
          <ul tabindex="0" class="mt-3 z-1 p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
            <li><a>Logout</a></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Main Layout: Sidebar below navbar, content to the right -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Mobile Drawer (overlay) -->
      <input id="main-drawer" type="checkbox" class="drawer-toggle" v-model="isSidebarOpen" />

      <!-- Sidebar (horizontal menu below navbar) -->
      <aside
        v-show="!isSidebarCollapsed"
        class="hidden lg:block w-64 shrink-0 bg-base-100 border-r border-base-200 overflow-y-auto"
      >
        <ul class="menu p-4 w-full text-base-content">
          <li>
            <details open>
              <summary class="font-medium">Category A</summary>
              <ul>
                <li><a>Tool 1</a></li>
                <li><a>Tool 2</a></li>
              </ul>
            </details>
          </li>

          <li>
            <details>
              <summary class="font-medium">Category B</summary>
              <ul>
                <li><a>Tool 3</a></li>
                <li><a>Tool 4</a></li>
              </ul>
            </details>
          </li>
        </ul>
      </aside>

      <!-- Mobile sidebar as drawer overlay -->
      <div class="drawer-side lg:hidden z-40">
        <label for="main-drawer" class="drawer-overlay"></label>
        <aside class="bg-base-100 w-80 min-h-full flex flex-col border-r border-base-200">
          <!-- Search bar for mobile -->
          <div class="p-4 border-b border-base-200">
            <input type="text" placeholder="Search..." class="input input-bordered w-full" />
          </div>
          <ul class="menu p-4 w-full text-base-content grow">
            <li>
              <details open>
                <summary class="font-medium">Category A</summary>
                <ul>
                  <li><a>Tool 1</a></li>
                  <li><a>Tool 2</a></li>
                </ul>
              </details>
            </li>

            <li>
              <details>
                <summary class="font-medium">Category B</summary>
                <ul>
                  <li><a>Tool 3</a></li>
                  <li><a>Tool 4</a></li>
                </ul>
              </details>
            </li>
          </ul>
        </aside>
      </div>

      <!-- Main Content -->
      <main class="flex-1 p-6 overflow-y-auto">
        <div class="grid grid-cols-1 gap-6">
          <div
            class="card bg-base-100 shadow-xl p-10 items-center justify-center border-2 border-dashed border-base-300"
          >
            <h2 class="text-2xl font-bold opacity-20">Main Content Area</h2>
            <p class="opacity-20">Your Vue components go here</p>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';

const isSidebarOpen = ref(false);
const isSidebarCollapsed = ref(false);
</script>
