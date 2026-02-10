<template>
  <div class="drawer lg:drawer-open">
    <input id="main-drawer" type="checkbox" class="drawer-toggle" v-model="isSidebarOpen" />

    <div class="drawer-content flex flex-col min-h-screen bg-base-200">
      <div class="navbar bg-base-100 sticky top-0 z-30 shadow-sm gap-2">
        <div class="flex-none lg:hidden">
          <label for="main-drawer" class="btn btn-square btn-ghost">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block w-6 h-6 stroke-current"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </label>
        </div>

        <div class="flex-1 px-2 mx-2 font-bold text-xl">MyWebApp</div>

        <div class="flex-none hidden md:block">
          <input type="text" placeholder="Search..." class="input input-bordered w-24 md:w-auto" />
        </div>

        <div class="flex-none gap-2">
          <button class="btn btn-ghost btn-circle">
            <span class="text-lg">🌓</span>
          </button>
          <div class="dropdown dropdown-end">
            <label tabindex="0" class="btn btn-ghost btn-circle avatar">
              <div class="w-10 rounded-full bg-neutral text-neutral-content">
                <span>User</span>
              </div>
            </label>
            <ul tabindex="0" class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
              <li><a>Logout</a></li>
            </ul>
          </div>
        </div>
      </div>

      <main class="p-6">
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

    <div class="drawer-side z-40">
      <label for="main-drawer" class="drawer-overlay"></label>
      <aside class="bg-base-100 w-80 min-h-full flex flex-col border-r border-base-200">
        <div class="p-4 font-black text-2xl hidden lg:block border-b border-base-200">DASHBOARD</div>

        <ul class="menu p-4 w-full text-base-content flex-grow">
          <li><a>Dashboard</a></li>

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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isSidebarOpen = ref(false);
</script>
