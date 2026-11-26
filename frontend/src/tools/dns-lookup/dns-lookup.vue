<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import {
  RECORD_TYPES,
  NAMED_RESOLVERS,
  MAX_RESOLVERS,
  compareAnswers,
  describeRcode,
  formatTtl,
  isValidCustomResolver,
  lookupDns,
  type DnsResponse,
} from "./dns-lookup";

const name = ref("example.com");
const type = ref<string>("A");
const selected = ref<string[]>(["cloudflare", "google"]);
const customInput = ref("");
const customResolvers = ref<string[]>([]);
const loading = ref(false);
const requestError = ref("");
const response = ref<DnsResponse | null>(null);
let controller: AbortController | null = null;

const customError = computed(() => {
  const v = customInput.value.trim();
  return v && !isValidCustomResolver(v) ? "Enter an IP address, optionally with :port" : "";
});

const allResolvers = computed(() => [...selected.value, ...customResolvers.value]);
const tooMany = computed(() => allResolvers.value.length > MAX_RESOLVERS);
const canSubmit = computed(
  () => !!name.value.trim() && allResolvers.value.length > 0 && !tooMany.value && !loading.value,
);

const comparison = computed(() => (response.value ? compareAnswers(response.value.results) : null));

function toggle(id: string) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push(id);
}

function addCustom() {
  const v = customInput.value.trim();
  if (!v || !isValidCustomResolver(v) || customResolvers.value.includes(v)) return;
  customResolvers.value.push(v);
  customInput.value = "";
}

function removeCustom(v: string) {
  customResolvers.value = customResolvers.value.filter((x) => x !== v);
}

function resolverLabel(id: string): string {
  return NAMED_RESOLVERS.find((r) => r.id === id)?.label ?? id;
}

async function run() {
  if (!canSubmit.value) return;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  requestError.value = "";
  try {
    response.value = await lookupDns(
      { name: name.value.trim(), type: type.value, resolvers: allResolvers.value },
      controller.signal,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    response.value = null;
    requestError.value = e instanceof Error ? e.message : "Lookup failed.";
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => controller?.abort());

function copy(value: string) {
  navigator.clipboard.writeText(value);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <form class="flex flex-col gap-4" @submit.prevent="run">
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div class="form-control">
              <label class="label pb-1" for="dns-name">
                <span class="label-text font-medium">Domain name or IP address</span>
              </label>
              <input
                id="dns-name"
                v-model="name"
                type="text"
                spellcheck="false"
                autocomplete="off"
                placeholder="example.com or 8.8.8.8"
                class="input input-bordered w-full font-mono"
              />
            </div>
            <div class="form-control">
              <label class="label pb-1" for="dns-type">
                <span class="label-text font-medium">Record type</span>
              </label>
              <select id="dns-type" v-model="type" class="select select-bordered w-full">
                <option v-for="t in RECORD_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div class="form-control">
            <span class="label-text font-medium mb-1">
              Resolvers ({{ allResolvers.length }}/{{ MAX_RESOLVERS }})
            </span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="r in NAMED_RESOLVERS"
                :key="r.id"
                type="button"
                class="btn btn-sm"
                :class="selected.includes(r.id) ? 'btn-primary' : 'btn-outline'"
                :aria-pressed="selected.includes(r.id)"
                :title="r.hint"
                @click="toggle(r.id)"
              >
                {{ r.label }}
              </button>
              <span
                v-for="c in customResolvers"
                :key="c"
                class="badge badge-lg badge-primary gap-1 font-mono"
              >
                {{ c }}
                <button
                  type="button"
                  class="cursor-pointer"
                  :aria-label="`Remove ${c}`"
                  @click="removeCustom(c)"
                >
                  <Icon icon="solar:close-circle-bold" class="h-4 w-4" />
                </button>
              </span>
            </div>
            <div class="flex gap-2 mt-2">
              <input
                v-model="customInput"
                type="text"
                spellcheck="false"
                autocomplete="off"
                placeholder="Custom resolver: 9.9.9.9 or 10.0.0.1:5353"
                class="input input-bordered input-sm flex-1 font-mono"
                :class="{ 'input-error': customError }"
                aria-label="Custom resolver"
                @keydown.enter.prevent="addCustom"
              />
              <button
                type="button"
                class="btn btn-sm btn-outline"
                :disabled="!customInput.trim() || !!customError"
                @click="addCustom"
              >
                Add
              </button>
            </div>
            <span v-if="customError" class="text-xs text-error mt-1">{{ customError }}</span>
            <span v-if="tooMany" class="text-xs text-error mt-1">
              At most {{ MAX_RESOLVERS }} resolvers can be queried at once.
            </span>
          </div>

          <div>
            <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
              <span v-if="loading" class="loading loading-spinner loading-sm"></span>
              <Icon v-else icon="solar:magnifer-bold" class="h-4 w-4" />
              Lookup
            </button>
          </div>
        </form>

        <div v-if="requestError" class="alert alert-error py-2 mt-4" role="alert">
          <Icon icon="solar:danger-circle-bold" class="h-5 w-5 shrink-0" />
          <span class="text-sm break-words">{{ requestError }}</span>
        </div>

        <div v-if="response && comparison" class="mt-4 flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono font-medium break-all">{{ response.name }}</span>
            <span class="badge badge-outline">{{ response.type }}</span>
            <span v-if="comparison.disagree" class="badge badge-warning gap-1">
              <Icon icon="solar:danger-triangle-bold" class="h-3 w-3" />
              Resolvers disagree
            </span>
            <span
              v-else-if="comparison.results.filter((r) => !r.error).length > 1"
              class="badge badge-success gap-1"
            >
              <Icon icon="solar:check-circle-bold" class="h-3 w-3" />
              Resolvers agree
            </span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <div
              v-for="r in comparison.results"
              :key="r.resolver"
              class="rounded-box border border-base-300 p-3 flex flex-col gap-2 min-w-0"
              :class="{ 'border-error': r.error }"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="font-medium truncate">{{ resolverLabel(r.resolver) }}</div>
                  <div v-if="r.address" class="font-mono text-xs text-base-content/60">
                    {{ r.address }}
                  </div>
                </div>
                <span v-if="!r.error" class="text-xs text-base-content/60 whitespace-nowrap">
                  {{ r.queryTimeMs.toFixed(0) }} ms
                </span>
              </div>

              <div v-if="r.error" class="alert alert-error py-2 text-sm" role="alert">
                <Icon
                  :icon="r.blocked ? 'solar:shield-warning-bold' : 'solar:danger-circle-bold'"
                  class="h-5 w-5 shrink-0"
                />
                <span class="break-words min-w-0">{{ r.error }}</span>
              </div>

              <template v-else>
                <div class="flex flex-wrap gap-1">
                  <span
                    class="badge badge-sm"
                    :class="
                      r.rcode === 'NOERROR'
                        ? 'badge-success'
                        : r.rcode === 'NXDOMAIN'
                          ? 'badge-warning'
                          : 'badge-error'
                    "
                    :title="describeRcode(r.rcode)"
                  >
                    {{ r.rcode }}
                  </span>
                  <span v-if="r.rcode !== 'NOERROR'" class="text-xs text-base-content/60">
                    {{ describeRcode(r.rcode) }}
                  </span>
                  <span v-if="r.authoritative" class="badge badge-sm badge-info"
                    >authoritative</span
                  >
                  <span v-if="r.usedTcp" class="badge badge-sm badge-ghost">TCP</span>
                  <span v-if="r.truncated" class="badge badge-sm badge-warning">truncated</span>
                </div>

                <ul v-if="r.records.length" class="flex flex-col gap-1">
                  <li
                    v-for="(rec, i) in r.records"
                    :key="i"
                    class="rounded px-2 py-1 text-sm flex items-start gap-2"
                    :class="
                      rec.status === 'unique'
                        ? 'bg-warning/20 border border-warning'
                        : 'bg-base-200'
                    "
                  >
                    <div class="min-w-0 flex-1">
                      <span class="badge badge-xs badge-outline mr-1">{{ rec.type }}</span>
                      <span class="font-mono text-xs break-all">{{ rec.display }}</span>
                    </div>
                    <span
                      class="text-xs text-base-content/60 whitespace-nowrap"
                      :title="`TTL ${rec.ttl}s`"
                    >
                      {{ formatTtl(rec.ttl) }}
                    </span>
                    <button
                      type="button"
                      class="btn btn-xs btn-ghost"
                      title="Copy"
                      @click="copy(rec.display)"
                    >
                      <Icon icon="solar:copy-bold" class="h-3 w-3" />
                    </button>
                  </li>
                </ul>
                <div v-else class="text-sm text-base-content/50">No records</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
