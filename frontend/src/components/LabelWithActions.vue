<script setup lang="ts">
/**
 * LabelWithActions - A reusable component for form labels with action buttons
 *
 * This component follows the correct semantic HTML pattern where buttons are NOT
 * embedded inside the label element. Instead, labels and buttons are siblings
 * within a flex container.
 *
 * Usage:
 * <LabelWithActions label="Input">
 *   <button class="btn btn-xs btn-ghost" @click="copy">Copy</button>
 * </LabelWithActions>
 *
 * Or with label slot for more complex label content:
 * <LabelWithActions>
 *   <template #label>
 *     Input ({{ formatName }})
 *   </template>
 *   <button class="btn btn-xs btn-ghost" @click="copy">Copy</button>
 * </LabelWithActions>
 */

defineProps<{
  /** The label text (can also use the #label slot for more complex content) */
  label?: string;
}>();
</script>

<template>
  <div class="label-with-actions flex flex-row items-center">
    <label class="label flex-1">
      <span class="label-text font-medium">
        <slot name="label">{{ label }}</slot>
      </span>
    </label>
    <div class="label-actions flex gap-1">
      <slot></slot>
    </div>
  </div>
</template>
