<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { caseFormats } from "./case-converter";

const input = ref("");

const results = computed(() =>
  caseFormats.map((f) => ({ id: f.id, label: f.label, value: f.fn(input.value) })),
);

function copy(text: string) {
  navigator.clipboard.writeText(text);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="form-control">
          <LabelWithActions label="Text">
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="input = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            v-model="input"
            class="textarea textarea-bordered h-24 w-full"
            placeholder="Type or paste text, e.g. my variable name..."
            spellcheck="false"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div v-for="r in results" :key="r.id" class="form-control">
            <LabelWithActions :label="r.label">
              <button
                v-if="r.value"
                class="btn btn-ghost btn-sm"
                :aria-label="`Copy ${r.label}`"
                @click="copy(r.value)"
              >
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                Copy
              </button>
            </LabelWithActions>
            <input
              :value="r.value"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              readonly
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
