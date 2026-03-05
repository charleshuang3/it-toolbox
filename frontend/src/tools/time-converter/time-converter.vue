<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { DateTime } from 'luxon';
import { parseTimeInput, commonTimezones, getLocalTimezone } from './time-converter';

// Get local timezone
const localTimezone = getLocalTimezone();

// Input state
const inputValue = ref('');
const inputType = ref<'auto' | 'iso' | 'unix' | 'relative'>('auto');
const selectedTimezone = ref(localTimezone);

// Parsed result
const parsedDateTime = ref<DateTime | null>(null);
const parseError = ref('');

// Auto-parse on input change
watch([inputValue, inputType, selectedTimezone], () => {
  parseInput();
});

function parseInput() {
  parseError.value = '';
  parsedDateTime.value = null;

  if (!inputValue.value.trim()) {
    return;
  }

  const result = parseTimeInput(inputValue.value, inputType.value, selectedTimezone.value);
  parseError.value = result.error;
  parsedDateTime.value = result.dateTime;
}

// Conversion results
const conversions = computed(() => {
  if (!parsedDateTime.value) {
    return [];
  }

  const dt = parsedDateTime.value;

  return [
    {
      label: 'ISO 8601',
      value: dt.toISO() || '',
      icon: 'mdi:code-tags',
    },
    {
      label: 'ISO 8601 (Local)',
      value: dt.toLocal().toISO() || '',
      icon: 'mdi:code-tags',
    },
    {
      label: 'RFC 2822',
      value: dt.toRFC2822(),
      icon: 'mdi:email-outline',
    },
    {
      label: 'SQL',
      value: dt.toSQL(),
      icon: 'mdi:database',
    },
    {
      label: 'Unix Timestamp (seconds)',
      value: Math.floor(dt.toSeconds()).toString(),
      icon: 'mdi:numeric',
    },
    {
      label: 'Unix Timestamp (milliseconds)',
      value: dt.toMillis().toString(),
      icon: 'mdi:numeric',
    },
    {
      label: 'Human Readable',
      value: dt.toLocaleString(DateTime.DATETIME_FULL),
      icon: 'mdi:format-text',
    },
    {
      label: 'Date Only',
      value: dt.toLocaleString(DateTime.DATE_FULL),
      icon: 'mdi:calendar',
    },
    {
      label: 'Time Only',
      value: dt.toLocaleString(DateTime.TIME_WITH_SECONDS),
      icon: 'mdi:clock-outline',
    },
    {
      label: 'Relative',
      value: dt.toRelative() || '',
      icon: 'ic:baseline-more-time',
    },
    {
      label: 'UTC Offset',
      value: dt.toFormat('ZZ'),
      icon: 'mdi:map-marker-radius',
    },
    {
      label: 'Day of Week',
      value: dt.toFormat('cccc'),
      icon: 'mdi:calendar-week',
    },
  ];
});

// Timezone conversions
const timezoneConversions = computed(() => {
  if (!parsedDateTime.value) {
    return [];
  }

  const dt = parsedDateTime.value;

  return commonTimezones.map((tz) => ({
    timezone: tz,
    display: dt.setZone(tz).toFormat('yyyy-MM-dd HH:mm:ss'),
    offset: dt.setZone(tz).toFormat('ZZ'),
    isLocal: tz === localTimezone,
  }));
});

// Set to current time
function setNow() {
  inputValue.value = DateTime.now().toISO() || '';
  parseInput();
}

// Copy to clipboard
function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

// Copy all conversions
function copyAll() {
  const text = conversions.value.map((c) => `${c.label}: ${c.value || ''}`).join('\n');
  navigator.clipboard.writeText(text);
}

// Use current time as default
setNow();
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Input Section -->
        <div class="flex flex-col sm:flex-row gap-4">
          <!-- Input value -->
          <div class="form-control flex-1">
            <label class="label">
              <span class="label-text">Input</span>
              <span class="label-text-alt">Enter date/time or timestamp</span>
            </label>
            <div class="flex gap-2">
              <input
                v-model="inputValue"
                type="text"
                class="input input-bordered flex-1 font-mono"
                placeholder="2024-01-15T10:30:00Z or 1705315800"
              />
              <button class="btn btn-square" @click="setNow" title="Now">
                <Icon icon="solar:refresh-bold" class="h-5 w-5" />
              </button>
            </div>
          </div>

          <!-- Timezone selection -->
          <div class="form-control w-full sm:w-48">
            <label class="label">
              <span class="label-text">Input Timezone</span>
            </label>
            <select v-model="selectedTimezone" class="select select-bordered">
              <option value="local">Local ({{ localTimezone }})</option>
              <option v-for="tz in commonTimezones" :key="tz" :value="tz">{{ tz }}</option>
            </select>
          </div>
        </div>

        <!-- Input type hint -->
        <div class="text-sm text-base-content/50 mt-1">
          Supported: ISO 8601, RFC 2822, SQL, Unix timestamp (seconds or milliseconds)
        </div>

        <!-- Error message -->
        <div v-if="parseError" class="alert alert-warning mt-2">
          <Icon icon="mdi:alert-outline" class="h-5 w-5" />
          <span>{{ parseError }}</span>
        </div>

        <!-- Results -->
        <div v-if="parsedDateTime && !parseError" class="mt-6 space-y-6">
          <!-- Format Conversions -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Format Conversions</h3>
              <button class="btn btn-sm btn-ghost" @click="copyAll">
                <Icon icon="solar:copy-bold" class="h-4 w-4" />
                Copy All
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div
                v-for="conversion in conversions"
                :key="conversion.label"
                class="flex items-center gap-3 p-3 bg-base-200 rounded-lg"
              >
                <Icon :icon="conversion.icon" class="h-4 w-4 text-base-content/50 shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-base-content/50">{{ conversion.label }}</div>
                  <div class="font-mono text-sm truncate">{{ conversion.value }}</div>
                </div>
                <button
                  class="btn btn-circle btn-ghost btn-xs shrink-0"
                  @click="copyToClipboard(conversion.value || '')"
                  title="Copy"
                >
                  <Icon icon="solar:copy-bold" class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <!-- Timezone Conversions -->
          <div class="space-y-3">
            <h3 class="text-lg font-semibold">Timezone Conversions</h3>
            <div class="overflow-x-auto">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th>Timezone</th>
                    <th>DateTime</th>
                    <th>Offset</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tz in timezoneConversions" :key="tz.timezone" :class="{ 'bg-primary/10': tz.isLocal }">
                    <td class="font-mono text-xs">
                      {{ tz.timezone }}
                      <span v-if="tz.isLocal" class="badge badge-primary badge-xs ml-1">Local</span>
                    </td>
                    <td class="font-mono text-xs">{{ tz.display }}</td>
                    <td class="font-mono text-xs text-base-content/60">{{ tz.offset }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!parseError" class="text-center text-base-content/50 py-8">
          <Icon icon="mdi:clock-time-four-outline" class="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Enter a date/time value above to see conversions</p>
        </div>
      </div>
    </div>
  </div>
</template>
