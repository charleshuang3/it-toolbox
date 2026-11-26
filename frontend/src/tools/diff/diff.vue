<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { computeDiff, buildRows, splitPanes, type DiffMode, type DiffPart } from "./diff";

const left = ref('{\n  "name": "toolbox",\n  "version": 1,\n  "tags": ["a", "b"]\n}');
const right = ref('{\n  "version": 2,\n  "name": "toolbox",\n  "tags": ["a", "c"]\n}');
const mode = ref<DiffMode>("line");
const view = ref<"side" | "inline">("side");
const ignoreWhitespace = ref(false);

const modes: { value: DiffMode; label: string }[] = [
  { value: "line", label: "Lines" },
  { value: "word", label: "Words" },
  { value: "json", label: "JSON (sorted keys)" },
];

const result = computed(() =>
  computeDiff(left.value, right.value, {
    mode: mode.value,
    ignoreWhitespace: ignoreWhitespace.value,
  }),
);

const rows = computed(() => (result.value.lineBased ? buildRows(result.value.parts) : []));
const panes = computed(() => splitPanes(result.value.parts));

interface InlineLine {
  sign: string;
  text: string;
  type: DiffPart["type"];
}
const inlineLines = computed<InlineLine[]>(() => {
  const out: InlineLine[] = [];
  for (const p of result.value.parts) {
    const lines = p.text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const sign = p.type === "add" ? "+" : p.type === "del" ? "-" : " ";
    for (const t of lines) out.push({ sign, text: t, type: p.type });
  }
  return out;
});

const cls = (t: DiffPart["type"] | null | undefined) =>
  t === "add" ? "bg-success/25" : t === "del" ? "bg-error/25" : "";

function swap() {
  [left.value, right.value] = [right.value, left.value];
}

function copy(value: string) {
  navigator.clipboard.writeText(value);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- Options -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="join">
              <button
                v-for="m in modes"
                :key="m.value"
                class="btn btn-sm join-item"
                :class="mode === m.value ? 'btn-primary' : 'btn-outline'"
                @click="mode = m.value"
              >
                {{ m.label }}
              </button>
            </div>
            <div class="join">
              <button
                class="btn btn-sm join-item"
                :class="view === 'side' ? 'btn-primary' : 'btn-outline'"
                @click="view = 'side'"
              >
                Side-by-side
              </button>
              <button
                class="btn btn-sm join-item"
                :class="view === 'inline' ? 'btn-primary' : 'btn-outline'"
                @click="view = 'inline'"
              >
                Inline
              </button>
            </div>
            <label v-if="mode !== 'json'" class="label cursor-pointer gap-2">
              <input v-model="ignoreWhitespace" type="checkbox" class="checkbox checkbox-sm" />
              <span class="label-text">Ignore whitespace</span>
            </label>
            <button class="btn btn-sm btn-ghost" title="Swap sides" @click="swap">
              <Icon icon="mdi:swap-horizontal" class="h-4 w-4" />
              Swap
            </button>
          </div>

          <!-- Inputs -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="form-control">
              <LabelWithActions label="Original">
                <button class="btn btn-xs btn-ghost" title="Copy" @click="copy(left)">
                  <Icon icon="solar:copy-bold" class="h-3 w-3" />
                </button>
              </LabelWithActions>
              <textarea
                v-model="left"
                spellcheck="false"
                class="textarea textarea-bordered w-full h-48 font-mono text-sm"
              ></textarea>
            </div>
            <div class="form-control">
              <LabelWithActions label="Changed">
                <button class="btn btn-xs btn-ghost" title="Copy" @click="copy(right)">
                  <Icon icon="solar:copy-bold" class="h-3 w-3" />
                </button>
              </LabelWithActions>
              <textarea
                v-model="right"
                spellcheck="false"
                class="textarea textarea-bordered w-full h-48 font-mono text-sm"
              ></textarea>
            </div>
          </div>

          <div class="divider my-0"></div>

          <div v-if="result.error" class="alert alert-error py-2">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5 shrink-0" />
            <span class="text-sm break-all">{{ result.error }}</span>
          </div>

          <template v-else>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="badge badge-success badge-outline">+{{ result.added }}</span>
              <span class="badge badge-error badge-outline">-{{ result.removed }}</span>
              <span v-if="result.identical" class="text-success flex items-center gap-1">
                <Icon icon="solar:check-circle-bold" class="h-4 w-4" />
                Identical
              </span>
            </div>

            <!-- Side-by-side, line based -->
            <div
              v-if="view === 'side' && result.lineBased"
              class="border border-base-content/20 rounded-btn overflow-auto max-h-[32rem]"
            >
              <table class="w-full table-fixed font-mono text-xs">
                <tbody>
                  <tr v-for="(row, i) in rows" :key="i" class="align-top">
                    <td
                      class="w-8 px-1 text-right text-base-content/40 select-none"
                      :class="cls(row.left?.type)"
                    >
                      {{ row.left?.no }}
                    </td>
                    <td
                      class="px-2 whitespace-pre-wrap break-all border-r border-base-content/20"
                      :class="cls(row.left?.type)"
                    >
                      {{ row.left?.text }}
                    </td>
                    <td
                      class="w-8 px-1 text-right text-base-content/40 select-none"
                      :class="cls(row.right?.type)"
                    >
                      {{ row.right?.no }}
                    </td>
                    <td class="px-2 whitespace-pre-wrap break-all" :class="cls(row.right?.type)">
                      {{ row.right?.text }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Side-by-side, word based -->
            <div v-else-if="view === 'side'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <pre
                class="border border-base-content/20 rounded-btn p-3 font-mono text-xs whitespace-pre-wrap break-words max-h-[32rem] overflow-auto"
              ><span v-for="(p, i) in panes.left" :key="i" :class="cls(p.type)">{{ p.text }}</span></pre>
              <pre
                class="border border-base-content/20 rounded-btn p-3 font-mono text-xs whitespace-pre-wrap break-words max-h-[32rem] overflow-auto"
              ><span v-for="(p, i) in panes.right" :key="i" :class="cls(p.type)">{{ p.text }}</span></pre>
            </div>

            <!-- Inline, line based -->
            <div
              v-else-if="result.lineBased"
              class="border border-base-content/20 rounded-btn overflow-auto max-h-[32rem] font-mono text-xs"
            >
              <div v-for="(l, i) in inlineLines" :key="i" class="flex px-2" :class="cls(l.type)">
                <span class="w-4 shrink-0 select-none text-base-content/50">{{ l.sign }}</span>
                <span class="whitespace-pre-wrap break-all">{{ l.text }}</span>
              </div>
            </div>

            <!-- Inline, word based -->
            <pre
              v-else
              class="border border-base-content/20 rounded-btn p-3 font-mono text-xs whitespace-pre-wrap break-words max-h-[32rem] overflow-auto"
            ><span v-for="(p, i) in result.parts" :key="i" :class="[cls(p.type), p.type === 'del' ? 'line-through' : '']">{{ p.text }}</span></pre>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
