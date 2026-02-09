<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div class="min-h-screen bg-base-200">
    <div class="container mx-auto p-4">
      <h1 class="text-4xl font-bold text-center mb-8">IT Toolbox</h1>

      <div class="card bg-base-100 shadow-xl max-w-md mx-auto">
        <div class="card-body">
          <h2 class="card-title">Welcome to IT Toolbox</h2>
          <p>This is a collection of IT tools and utilities.</p>

          <div class="divider"></div>

          <div class="flex justify-center items-center gap-4">
            <button class="btn btn-primary" @click="count++">Count: {{ count }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
