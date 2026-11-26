<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import {
  IpError,
  MAX_SPLIT_ROWS,
  aggregate,
  bitsOf,
  calculate,
  describeRelation,
  formatBigInt,
  networkOf,
  formatAddress,
  parseCidrInput,
  rangeInputToCidrs,
  splitByCount,
  splitByPrefix,
} from "./ip-subnet";

type Tab = "calc" | "split" | "contains" | "range";
const tabs: { id: Tab; label: string }[] = [
  { id: "calc", label: "Calculator" },
  { id: "split", label: "Split" },
  { id: "contains", label: "Contains / Overlap" },
  { id: "range", label: "Range & Aggregate" },
];
const tab = ref<Tab>("calc");

function copy(text: string) {
  navigator.clipboard?.writeText(text);
}

function errMsg(e: unknown): string {
  return e instanceof IpError ? e.message : e instanceof Error ? e.message : String(e);
}

/** Run fn; return [value, error]. Empty input yields neither. */
function attempt<T>(input: string, fn: () => T): { value: T | null; error: string } {
  if (input.trim() === "") return { value: null, error: "" };
  try {
    return { value: fn(), error: "" };
  } catch (e) {
    return { value: null, error: errMsg(e) };
  }
}

// ---- Calculator
const calcInput = ref("192.168.1.10/24");
const calcResult = computed(() =>
  attempt(calcInput.value, () => calculate(parseCidrInput(calcInput.value))),
);
const calcRows = computed(() => {
  const r = calcResult.value.value;
  if (!r) return [];
  const rows: { label: string; value: string; note?: string }[] = [
    { label: "CIDR notation", value: r.cidr },
    { label: "Network address", value: r.network },
  ];
  if (r.broadcast) rows.push({ label: "Broadcast address", value: r.broadcast });
  rows.push(
    { label: "Netmask", value: r.netmask },
    { label: "Wildcard mask", value: r.wildcard },
    { label: "First usable host", value: r.firstHost },
    { label: "Last usable host", value: r.lastHost },
    {
      label: "Total addresses",
      value: formatBigInt(r.totalAddresses),
      note: r.hostBits >= 32 ? `2^${r.hostBits}` : undefined,
    },
    { label: "Usable hosts", value: formatBigInt(r.usableHosts) },
  );
  if (r.ipClass) rows.push({ label: "IP class", value: r.ipClass });
  rows.push({ label: "Type / scope", value: r.type });
  if (r.compressed) rows.push({ label: "Compressed", value: r.compressed });
  if (r.expanded) rows.push({ label: "Expanded", value: r.expanded });
  if (r.mappedIPv4) rows.push({ label: "Mapped IPv4", value: r.mappedIPv4 });
  rows.push({ label: "Reverse DNS", value: r.reverseDns });
  return rows;
});

// ---- Split
const splitInput = ref("10.0.0.0/16");
const splitMode = ref<"count" | "prefix">("count");
const splitCount = ref(4);
const splitPrefix = ref(24);
const splitResult = computed(() =>
  attempt(splitInput.value, () => {
    const c = parseCidrInput(splitInput.value);
    return {
      base: `${formatAddress(c.version, networkOf(c))}/${c.prefix}`,
      ...(splitMode.value === "count"
        ? splitByCount(c, Number(splitCount.value))
        : splitByPrefix(c, Number(splitPrefix.value))),
    };
  }),
);
const splitMax = computed(() => {
  const r = attempt(splitInput.value, () => bitsOf(parseCidrInput(splitInput.value).version));
  return r.value ?? 128;
});

// ---- Contains
const containsA = ref("10.0.0.0/8");
const containsB = ref("10.20.30.40");
const containsResult = computed(() => {
  if (containsA.value.trim() === "" || containsB.value.trim() === "") {
    return { value: null, error: "" };
  }
  return attempt("x", () =>
    describeRelation(parseCidrInput(containsA.value), parseCidrInput(containsB.value)),
  );
});

// ---- Range / aggregate
const rangeInput = ref("192.168.0.10 - 192.168.1.20");
const rangeResult = computed(() =>
  attempt(rangeInput.value, () => rangeInputToCidrs(rangeInput.value)),
);
const aggInput = ref(
  "10.0.0.0/25\n10.0.0.128/25\n10.0.1.0/24\n192.168.1.5\n2001:db8::/33\n2001:db8:8000::/33",
);
const aggResult = computed(() => attempt(aggInput.value, () => aggregate(aggInput.value)));
const aggOutput = computed(() => {
  const r = aggResult.value.value;
  return r ? [...r.v4, ...r.v6] : [];
});
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body gap-4">
        <div role="tablist" class="tabs tabs-box w-full overflow-x-auto flex-nowrap">
          <button
            v-for="t in tabs"
            :key="t.id"
            role="tab"
            class="tab whitespace-nowrap"
            :class="{ 'tab-active': tab === t.id }"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- Calculator -->
        <section v-if="tab === 'calc'" class="flex flex-col gap-3">
          <label class="form-control">
            <span class="label-text font-medium mb-1">
              Address (CIDR, netmask, wildcard; IPv4 or IPv6)
            </span>
            <input
              v-model="calcInput"
              type="text"
              class="input input-bordered font-mono w-full"
              placeholder="192.168.1.10/24, 10.0.0.1 255.255.255.0, 2001:db8::1/64"
              spellcheck="false"
              autocomplete="off"
            />
          </label>
          <div v-if="calcResult.error" class="alert alert-error">
            <Icon icon="mdi:alert-circle-outline" class="h-5 w-5 shrink-0" />
            <span>{{ calcResult.error }}</span>
          </div>
          <template v-if="calcResult.value">
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <tbody>
                  <tr v-for="row in calcRows" :key="row.label">
                    <th class="whitespace-nowrap w-40 font-medium">{{ row.label }}</th>
                    <td class="font-mono break-all">
                      {{ row.value }}
                      <span v-if="row.note" class="text-base-content/60">({{ row.note }})</span>
                    </td>
                    <td class="w-10 text-right">
                      <button
                        class="btn btn-circle btn-ghost btn-xs"
                        :aria-label="`Copy ${row.label}`"
                        @click="copy(row.value)"
                      >
                        <Icon icon="solar:copy-bold" class="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="label-text font-medium">Binary</span>
                <span class="badge badge-primary badge-sm">network</span>
                <span class="badge badge-secondary badge-sm">host</span>
                <button
                  class="btn btn-circle btn-ghost btn-xs"
                  aria-label="Copy binary"
                  @click="
                    copy(
                      calcResult.value.binary
                        .map((g) => g.network + g.host)
                        .join(calcResult.value.binarySeparator),
                    )
                  "
                >
                  <Icon icon="solar:copy-bold" class="h-4 w-4" />
                </button>
              </div>
              <div class="font-mono text-sm break-all flex flex-wrap gap-x-1">
                <span v-for="(g, i) in calcResult.value.binary" :key="i">
                  <span class="text-primary font-semibold">{{ g.network }}</span
                  ><span class="text-secondary">{{ g.host }}</span
                  ><span
                    v-if="i < calcResult.value.binary.length - 1"
                    class="text-base-content/50"
                    >{{ calcResult.value.binarySeparator }}</span
                  >
                </span>
              </div>
            </div>
          </template>
        </section>

        <!-- Split -->
        <section v-else-if="tab === 'split'" class="flex flex-col gap-3">
          <label class="form-control">
            <span class="label-text font-medium mb-1">Network to split</span>
            <input
              v-model="splitInput"
              type="text"
              class="input input-bordered font-mono w-full"
              placeholder="10.0.0.0/16 or 2001:db8::/32"
              spellcheck="false"
            />
          </label>
          <div class="flex flex-wrap items-center gap-3">
            <div role="tablist" class="tabs tabs-box w-fit">
              <button
                role="tab"
                class="tab"
                :class="{ 'tab-active': splitMode === 'count' }"
                @click="splitMode = 'count'"
              >
                Into N subnets
              </button>
              <button
                role="tab"
                class="tab"
                :class="{ 'tab-active': splitMode === 'prefix' }"
                @click="splitMode = 'prefix'"
              >
                By prefix length
              </button>
            </div>
            <label v-if="splitMode === 'count'" class="flex items-center gap-2">
              <span class="label-text">N</span>
              <input
                v-model.number="splitCount"
                type="number"
                min="1"
                class="input input-bordered w-28 font-mono"
              />
            </label>
            <label v-else class="flex items-center gap-2">
              <span class="label-text">Prefix /</span>
              <input
                v-model.number="splitPrefix"
                type="number"
                min="0"
                :max="splitMax"
                class="input input-bordered w-24 font-mono"
              />
            </label>
          </div>
          <div v-if="splitResult.error" class="alert alert-error">
            <Icon icon="mdi:alert-circle-outline" class="h-5 w-5 shrink-0" />
            <span>{{ splitResult.error }}</span>
          </div>
          <template v-if="splitResult.value">
            <div class="flex flex-wrap items-center gap-2">
              <span>
                {{ splitResult.value.base }} into
                <strong>{{ formatBigInt(splitResult.value.total) }}</strong>
                x /{{ splitResult.value.newPrefix }} subnets
              </span>
              <button
                class="btn btn-sm btn-ghost"
                @click="copy(splitResult.value.subnets.join('\n'))"
              >
                <Icon icon="solar:copy-bold" class="h-4 w-4" /> Copy list
              </button>
            </div>
            <div v-if="splitResult.value.truncated" class="alert alert-warning">
              <Icon icon="mdi:alert-outline" class="h-5 w-5 shrink-0" />
              <span>
                Showing only the first {{ MAX_SPLIT_ROWS }} of
                {{ formatBigInt(splitResult.value.total) }} subnets.
              </span>
            </div>
            <div class="overflow-x-auto max-h-96 overflow-y-auto">
              <table class="table table-sm table-zebra table-pin-rows">
                <thead>
                  <tr>
                    <th class="w-16">#</th>
                    <th>Subnet</th>
                    <th class="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in splitResult.value.subnets" :key="s">
                    <td class="text-base-content/60">{{ i + 1 }}</td>
                    <td class="font-mono break-all">{{ s }}</td>
                    <td class="text-right">
                      <button
                        class="btn btn-circle btn-ghost btn-xs"
                        :aria-label="`Copy ${s}`"
                        @click="copy(s)"
                      >
                        <Icon icon="solar:copy-bold" class="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </section>

        <!-- Contains -->
        <section v-else-if="tab === 'contains'" class="flex flex-col gap-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label-text font-medium mb-1">A (CIDR or IP)</span>
              <input
                v-model="containsA"
                type="text"
                class="input input-bordered font-mono w-full"
                spellcheck="false"
              />
            </label>
            <label class="form-control">
              <span class="label-text font-medium mb-1">B (CIDR or IP)</span>
              <input
                v-model="containsB"
                type="text"
                class="input input-bordered font-mono w-full"
                spellcheck="false"
              />
            </label>
          </div>
          <div v-if="containsResult.error" class="alert alert-error">
            <Icon icon="mdi:alert-circle-outline" class="h-5 w-5 shrink-0" />
            <span>{{ containsResult.error }}</span>
          </div>
          <div
            v-if="containsResult.value"
            class="alert"
            :class="
              containsResult.value.relation === 'disjoint' ? 'alert-warning' : 'alert-success'
            "
          >
            <Icon
              :icon="
                containsResult.value.relation === 'disjoint'
                  ? 'mdi:close-circle-outline'
                  : 'mdi:check-circle-outline'
              "
              class="h-5 w-5 shrink-0"
            />
            <span class="font-mono break-all">{{ containsResult.value.text }}</span>
          </div>
        </section>

        <!-- Range & aggregate -->
        <section v-else class="flex flex-col gap-6">
          <div class="flex flex-col gap-3">
            <h3 class="font-semibold">Range to CIDR</h3>
            <label class="form-control">
              <span class="label-text mb-1">Start - end</span>
              <input
                v-model="rangeInput"
                type="text"
                class="input input-bordered font-mono w-full"
                placeholder="192.168.0.10 - 192.168.1.20"
                spellcheck="false"
              />
            </label>
            <div v-if="rangeResult.error" class="alert alert-error">
              <Icon icon="mdi:alert-circle-outline" class="h-5 w-5 shrink-0" />
              <span>{{ rangeResult.error }}</span>
            </div>
            <template v-if="rangeResult.value">
              <div class="flex items-center gap-2">
                <span>{{ rangeResult.value.length }} CIDR block(s)</span>
                <button class="btn btn-sm btn-ghost" @click="copy(rangeResult.value.join('\n'))">
                  <Icon icon="solar:copy-bold" class="h-4 w-4" /> Copy
                </button>
              </div>
              <ul class="font-mono text-sm max-h-72 overflow-y-auto">
                <li v-for="c in rangeResult.value" :key="c" class="flex items-center gap-2 py-0.5">
                  <span class="break-all">{{ c }}</span>
                  <button
                    class="btn btn-circle btn-ghost btn-xs"
                    :aria-label="`Copy ${c}`"
                    @click="copy(c)"
                  >
                    <Icon icon="solar:copy-bold" class="h-4 w-4" />
                  </button>
                </li>
              </ul>
            </template>
          </div>

          <div class="divider my-0"></div>

          <div class="flex flex-col gap-3">
            <h3 class="font-semibold">Aggregate / merge</h3>
            <label class="form-control">
              <span class="label-text mb-1">
                CIDRs, IPs or ranges (one per line, or comma separated)
              </span>
              <textarea
                v-model="aggInput"
                class="textarea textarea-bordered font-mono w-full h-40"
                spellcheck="false"
              ></textarea>
            </label>
            <template v-if="aggResult.value">
              <div v-if="aggResult.value.errors.length" class="alert alert-error items-start">
                <Icon icon="mdi:alert-circle-outline" class="h-5 w-5 shrink-0" />
                <ul class="text-sm break-all">
                  <li v-for="e in aggResult.value.errors" :key="e">{{ e }}</li>
                </ul>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span>
                  {{ aggResult.value.inputCount }} valid input(s) merged into
                  <strong>{{ aggOutput.length }}</strong> block(s) ({{
                    aggResult.value.v4.length
                  }}
                  IPv4, {{ aggResult.value.v6.length }} IPv6)
                </span>
                <button
                  v-if="aggOutput.length"
                  class="btn btn-sm btn-ghost"
                  @click="copy(aggOutput.join('\n'))"
                >
                  <Icon icon="solar:copy-bold" class="h-4 w-4" /> Copy
                </button>
              </div>
              <ul class="font-mono text-sm max-h-72 overflow-y-auto">
                <li v-for="c in aggOutput" :key="c" class="flex items-center gap-2 py-0.5">
                  <span class="break-all">{{ c }}</span>
                  <button
                    class="btn btn-circle btn-ghost btn-xs"
                    :aria-label="`Copy ${c}`"
                    @click="copy(c)"
                  >
                    <Icon icon="solar:copy-bold" class="h-4 w-4" />
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
