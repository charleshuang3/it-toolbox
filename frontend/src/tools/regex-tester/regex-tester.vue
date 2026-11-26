<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { toSegments, type RegexRequest, type RegexResult } from "./regex-tester";

const TIMEOUT_MS = 2000;

const pattern = ref("(?<user>\\w+)@(?<host>[\\w.]+)");
const text = ref("Contact: alice@example.com, bob@test.org");
const replacement = ref("$<host>/$<user>");
const replaceMode = ref(false);

const flagDefs = [
  { flag: "g", label: "global" },
  { flag: "i", label: "ignore case" },
  { flag: "m", label: "multiline" },
  { flag: "s", label: "dotAll" },
  { flag: "u", label: "unicode" },
  { flag: "v", label: "unicodeSets" },
  { flag: "y", label: "sticky" },
  { flag: "d", label: "indices" },
];
const flags = ref(new Set(["g"]));
const flagString = computed(() =>
  flagDefs
    .map((f) => f.flag)
    .filter((f) => flags.value.has(f))
    .join(""),
);

function toggleFlag(f: string) {
  const next = new Set(flags.value);
  if (next.has(f)) next.delete(f);
  else next.add(f);
  flags.value = next;
}

const result = ref<RegexResult | null>(null);
const busy = ref(false);
const timeoutError = ref("");
const error = computed(() => timeoutError.value || result.value?.error || "");

let worker: Worker | null = null;
let reqId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;

function startWorker() {
  worker = new Worker(new URL("./regex-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
    if (e.data.id !== reqId) return;
    clearTimeout(timer);
    busy.value = false;
    result.value = e.data.result;
  };
  worker.onerror = (e) => {
    clearTimeout(timer);
    busy.value = false;
    timeoutError.value = e.message || "Worker error";
  };
}

function run() {
  const id = ++reqId;
  timeoutError.value = "";
  const req: RegexRequest = {
    pattern: pattern.value,
    flags: flagString.value,
    text: text.value,
    replacement: replaceMode.value ? replacement.value : undefined,
  };
  if (!worker) startWorker();
  busy.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (id !== reqId) return;
    // Likely catastrophic backtracking: kill the worker so the tab stays responsive.
    worker?.terminate();
    worker = null;
    busy.value = false;
    result.value = null;
    timeoutError.value = `Evaluation timed out after ${TIMEOUT_MS / 1000}s (possible catastrophic backtracking). Simplify the pattern.`;
  }, TIMEOUT_MS);
  worker!.postMessage({ id, req });
}

watch([pattern, text, replacement, replaceMode, flagString], () => {
  clearTimeout(debounce);
  debounce = setTimeout(run, 200);
});

onMounted(run);
onUnmounted(() => {
  clearTimeout(timer);
  clearTimeout(debounce);
  worker?.terminate();
  worker = null;
});

const segments = computed(() => (result.value ? toSegments(text.value, result.value.matches) : []));

function copy(value: string) {
  navigator.clipboard.writeText(value);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- Pattern -->
          <div class="form-control">
            <LabelWithActions label="Pattern">
              <button
                class="btn btn-xs btn-ghost"
                title="Copy"
                @click="copy(`/${pattern}/${flagString}`)"
              >
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </LabelWithActions>
            <div class="flex items-center gap-2">
              <span class="font-mono text-base-content/60">/</span>
              <input
                v-model="pattern"
                type="text"
                spellcheck="false"
                autocomplete="off"
                placeholder="Regular expression"
                class="input input-bordered input-sm flex-1 min-w-0 font-mono"
                :class="{ 'input-error': error }"
              />
              <span class="font-mono text-base-content/60">/{{ flagString }}</span>
            </div>
            <div class="flex flex-wrap gap-1 mt-2">
              <button
                v-for="f in flagDefs"
                :key="f.flag"
                class="btn btn-xs"
                :class="flags.has(f.flag) ? 'btn-primary' : 'btn-outline'"
                :title="f.label"
                @click="toggleFlag(f.flag)"
              >
                {{ f.flag }}
                <span class="hidden sm:inline font-normal">{{ f.label }}</span>
              </button>
            </div>
          </div>

          <div v-if="error" class="alert alert-error py-2">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5 shrink-0" />
            <span class="text-sm break-all">{{ error }}</span>
          </div>

          <!-- Test text -->
          <div class="form-control">
            <LabelWithActions label="Test text">
              <button class="btn btn-xs btn-ghost" title="Copy" @click="copy(text)">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </LabelWithActions>
            <textarea
              v-model="text"
              spellcheck="false"
              class="textarea textarea-bordered w-full h-32 font-mono text-sm"
              placeholder="Text to test against"
            ></textarea>
          </div>

          <!-- Highlighted -->
          <div class="form-control">
            <LabelWithActions>
              <template #label>
                Matches
                <span v-if="busy" class="loading loading-spinner loading-xs ml-2"></span>
                <span v-else-if="result" class="badge badge-sm badge-neutral ml-2">
                  {{ result.matches.length }}{{ result.truncated ? "+" : "" }}
                </span>
              </template>
            </LabelWithActions>
            <pre
              class="border border-base-content/20 rounded-btn p-3 font-mono text-sm whitespace-pre-wrap break-all min-h-12 max-h-64 overflow-auto bg-base-200/40"
            ><template v-for="(s, i) in segments" :key="i"><mark v-if="s.matchIndex !== null" class="text-base-content rounded-sm" :class="s.matchIndex % 2 ? 'bg-info/50' : 'bg-warning/60'">{{ s.text }}</mark><span v-else>{{ s.text }}</span></template></pre>
            <div v-if="result?.truncated" class="text-xs text-warning mt-1">
              Only the first 1000 matches are shown.
            </div>
          </div>

          <!-- Match list -->
          <div
            v-if="result && result.matches.length"
            class="overflow-x-auto max-h-96 overflow-y-auto"
          >
            <table class="table table-xs table-pin-rows">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Range</th>
                  <th>Match</th>
                  <th>Groups</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in result.matches" :key="i">
                  <td>{{ i + 1 }}</td>
                  <td class="font-mono text-xs whitespace-nowrap">{{ m.index }}-{{ m.end }}</td>
                  <td class="font-mono text-xs break-all">
                    <span v-if="m.text === ''" class="text-base-content/50">(empty)</span>
                    <template v-else>{{ m.text }}</template>
                  </td>
                  <td class="text-xs">
                    <div v-for="g in m.groups" :key="g.index" class="font-mono break-all">
                      <span class="badge badge-xs badge-outline mr-1">{{ g.name ?? g.index }}</span>
                      <span v-if="g.value === undefined" class="text-base-content/50"
                        >undefined</span
                      >
                      <template v-else>{{ g.value }}</template>
                    </div>
                    <span v-if="!m.groups.length" class="text-base-content/40">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-else-if="result && pattern && !error"
            class="text-center text-base-content/50 py-2"
          >
            No matches
          </div>

          <!-- Replace -->
          <div class="divider my-0"></div>
          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
              <input
                v-model="replaceMode"
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
              />
              <span class="label-text font-medium">Replace mode</span>
            </label>
            <div v-if="replaceMode" class="flex flex-col gap-2">
              <input
                v-model="replacement"
                type="text"
                spellcheck="false"
                placeholder="Replacement (supports $1, $&amp;, $&lt;name&gt;)"
                class="input input-bordered input-sm w-full font-mono"
              />
              <LabelWithActions label="Preview">
                <button
                  class="btn btn-xs btn-ghost"
                  title="Copy"
                  @click="copy(result?.replaced ?? '')"
                >
                  <Icon icon="solar:copy-bold" class="h-3 w-3" />
                </button>
              </LabelWithActions>
              <pre
                class="border border-base-content/20 rounded-btn p-3 font-mono text-sm whitespace-pre-wrap break-all min-h-12 max-h-64 overflow-auto bg-base-200/40"
                >{{ result?.replaced ?? "" }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
