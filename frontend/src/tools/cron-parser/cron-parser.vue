<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import LabelWithActions from "../../components/LabelWithActions.vue";
import { parseCron, listTimeZones, MAX_RUNS } from "./cron-parser";

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = listTimeZones();
if (!zones.includes(localTz)) zones.unshift(localTz);

const expression = ref("*/15 9-17 * * 1-5");
const timeZone = ref(localTz);
const count = ref(10);

const examples = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 15 min, weekdays 9-17", value: "*/15 9-17 * * 1-5" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Every 10 seconds", value: "*/10 * * * * *" },
  { label: "1st of month, 03:30", value: "30 3 1 * *" },
];

const result = computed(() => parseCron(expression.value, timeZone.value, count.value));

function copy(value: string) {
  navigator.clipboard.writeText(value);
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <div class="form-control">
            <LabelWithActions label="Cron expression">
              <button class="btn btn-xs btn-ghost" title="Copy" @click="copy(expression)">
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </LabelWithActions>
            <input
              v-model="expression"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="* * * * *   (or 6 fields with leading seconds)"
              class="input input-bordered w-full font-mono"
              :class="{ 'input-error': result.error }"
            />
            <div
              class="grid grid-cols-5 gap-1 mt-2 font-mono text-xs text-base-content/60 text-center"
            >
              <span>minute</span><span>hour</span><span>day</span><span>month</span
              ><span>weekday</span>
            </div>
            <div class="flex flex-wrap gap-1 mt-2">
              <button
                v-for="ex in examples"
                :key="ex.value"
                class="btn btn-xs btn-outline"
                @click="expression = ex.value"
              >
                {{ ex.label }}
              </button>
            </div>
          </div>

          <div v-if="result.error" class="alert alert-error py-2">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5 shrink-0" />
            <span class="text-sm break-words">{{ result.error }}</span>
          </div>

          <div v-else-if="result.description" class="alert alert-success py-2">
            <Icon icon="solar:check-circle-bold" class="h-5 w-5 shrink-0" />
            <div>
              <div class="font-medium">{{ result.description }}</div>
              <div class="text-xs opacity-70">
                {{ result.fieldCount === 6 ? "6 fields (with seconds)" : "5 fields" }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="form-control">
              <label class="label pb-1" for="cron-tz">
                <span class="label-text font-medium">Time zone</span>
              </label>
              <select
                id="cron-tz"
                v-model="timeZone"
                class="select select-bordered select-sm w-full"
              >
                <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
              </select>
            </div>
            <div class="form-control">
              <label class="label pb-1" for="cron-count">
                <span class="label-text font-medium">Next runs ({{ count }})</span>
              </label>
              <input
                id="cron-count"
                v-model.number="count"
                type="range"
                min="1"
                :max="MAX_RUNS"
                class="range range-primary range-sm"
              />
            </div>
          </div>

          <div v-if="result.runs.length">
            <LabelWithActions label="Upcoming runs">
              <button
                class="btn btn-xs btn-ghost"
                title="Copy all"
                @click="copy(result.runs.map((r) => r.formatted).join('\n'))"
              >
                <Icon icon="solar:copy-bold" class="h-3 w-3" />
              </button>
            </LabelWithActions>
            <div class="overflow-x-auto">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time ({{ timeZone }})</th>
                    <th class="hidden sm:table-cell">ISO (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in result.runs" :key="r.ms">
                    <td>{{ i + 1 }}</td>
                    <td class="font-mono text-xs whitespace-nowrap">{{ r.formatted }}</td>
                    <td class="font-mono text-xs hidden sm:table-cell">
                      {{ new Date(r.ms).toISOString() }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div
            v-else-if="!result.error && expression.trim()"
            class="text-center text-base-content/50"
          >
            No upcoming runs
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
