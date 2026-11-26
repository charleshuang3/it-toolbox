<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { decode, encode } from "./html-entities";

const direction = ref<"encode" | "decode">("encode");
const input = ref("");
const nonAscii = ref(false);
const style = ref<"named" | "decimal" | "hex">("named");

const result = computed(() => {
  if (!input.value) return { output: "", error: "" };
  try {
    if (direction.value === "decode") return { output: decode(input.value), error: "" };
    return {
      output: encode(input.value, {
        nonAscii: nonAscii.value,
        named: style.value === "named",
        hex: style.value === "hex",
      }),
      error: "",
    };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
});

function copy(text: string) {
  navigator.clipboard.writeText(text);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-wrap items-center gap-4">
          <div class="join">
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': direction === 'encode' }"
              @click="direction = 'encode'"
            >
              Encode
            </button>
            <button
              class="btn join-item btn-sm"
              :class="{ 'btn-primary': direction === 'decode' }"
              @click="direction = 'decode'"
            >
              Decode
            </button>
          </div>
          <template v-if="direction === 'encode'">
            <label class="label cursor-pointer gap-2">
              <input v-model="nonAscii" type="checkbox" class="checkbox checkbox-sm" />
              <span class="label-text">Encode all non-ASCII characters</span>
            </label>
            <select v-model="style" class="select select-bordered select-sm" :disabled="!nonAscii">
              <option value="named">Named (&amp;eacute;)</option>
              <option value="decimal">Decimal (&amp;#233;)</option>
              <option value="hex">Hex (&amp;#xE9;)</option>
            </select>
          </template>
        </div>

        <div class="form-control">
          <LabelWithActions :label="direction === 'encode' ? 'Text' : 'HTML with entities'">
            <button class="btn btn-ghost btn-sm" :disabled="!input" @click="input = ''">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
          </LabelWithActions>
          <textarea
            v-model="input"
            class="textarea textarea-bordered h-32 w-full font-mono text-sm"
            :placeholder="
              direction === 'encode' ? '<p>Hello & welcome</p>' : '&lt;p&gt;Hello&lt;/p&gt;'
            "
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="result.error" role="alert" class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5" />
          <span>{{ result.error }}</span>
        </div>

        <div class="form-control">
          <LabelWithActions label="Result">
            <button v-if="result.output" class="btn btn-ghost btn-sm" @click="copy(result.output)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy
            </button>
          </LabelWithActions>
          <textarea
            :value="result.output"
            class="textarea textarea-bordered h-32 w-full font-mono text-sm"
            readonly
            placeholder="Result will appear here..."
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>
