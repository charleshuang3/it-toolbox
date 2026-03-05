<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { DateTime } from 'luxon';
import cityTimezones from 'city-timezones';

// City timezone info interface
interface CityInfo {
  id: string;
  city: string;
  timezone: string;
  country?: string;
  province?: string;
}

const STORAGE_KEY = 'world-time-cities';
const STORAGE_DATE_FORMAT_KEY = 'world-time-date-format';
const STORAGE_TIME_FORMAT_KEY = 'world-time-time-format';

// Default format strings
const DEFAULT_DATE_FORMAT = 'yyyy-LLL-dd, EEE';
const DEFAULT_TIME_FORMAT = 'HH:mm:ss';

// Get local timezone info
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Get all cities from city-timezones package (filter out entries with missing data)
const allCities = cityTimezones.cityMapping
  .filter((city) => city.city && city.timezone)
  .map((city, index) => ({
    id: `${city.city.replace(/\s+/g, '_').toLowerCase()}_${city.timezone.replace(/[^a-zA-Z0-9]/g, '_')}_${index}`,
    city: city.city,
    timezone: city.timezone,
    country: city.iso3 || undefined,
    province: city.province || undefined,
  }));

// Default cities - local and GMT
const defaultCities: CityInfo[] = [{ id: 'local', city: 'Local', timezone: localTimezone }];

// Helper to load from storage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return defaultValue;
}

// Helper to save to storage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Reactive state
const cities = ref<CityInfo[]>(defaultCities);
const dateFormat = ref(DEFAULT_DATE_FORMAT);
const timeFormat = ref(DEFAULT_TIME_FORMAT);
const currentTime = ref(DateTime.now());
const showAddModal = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);

// Update current time every second
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // Load from storage
  cities.value = loadFromStorage(STORAGE_KEY, defaultCities);
  dateFormat.value = loadFromStorage(STORAGE_DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT);
  timeFormat.value = loadFromStorage(STORAGE_TIME_FORMAT_KEY, DEFAULT_TIME_FORMAT);

  // Start timer
  timer = setInterval(() => {
    currentTime.value = DateTime.now();
  }, 500);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});

// Sync cities with storage
watch(
  cities,
  (newCities) => {
    saveToStorage(STORAGE_KEY, newCities);
  },
  { deep: true },
);

// Sync format with storage
watch(dateFormat, (newFormat) => {
  saveToStorage(STORAGE_DATE_FORMAT_KEY, newFormat);
});

watch(timeFormat, (newFormat) => {
  saveToStorage(STORAGE_TIME_FORMAT_KEY, newFormat);
});

// Get existing city IDs
const existingCityIds = computed(() => new Set(cities.value.map((c) => c.id)));

// Filter cities based on search query
const filteredCities = computed(() => {
  if (!searchQuery.value) {
    return [];
  }

  const query = searchQuery.value.toLowerCase().trim();

  return allCities
    .filter((city) => !existingCityIds.value.has(city.id))
    .map((city) => {
      const cityMatch = city.city.toLowerCase().includes(query) ? 4 : 0;
      const countryMatch = city.country?.toLowerCase().includes(query) ? 3 : 0;
      const provinceMatch = city.province?.toLowerCase().includes(query) ? 2 : 0;
      const timezoneMatch = city.timezone.toLowerCase().includes(query) ? 1 : 0;
      const score = cityMatch + countryMatch + provinceMatch + timezoneMatch;
      return { ...city, score };
    })
    .filter((city) => city.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.city.localeCompare(b.city);
    })
    .slice(0, 50); // Limit to 50 results
});

// Highlight matching text
const highlightText = (text: string) => {
  if (!searchQuery.value || !text) {
    return text;
  }

  const query = searchQuery.value.toLowerCase();
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return text.replace(regex, '<mark class="bg-primary text-primary-content px-0.5 rounded">$1</mark>');
};

const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Get DateTime in specific timezone
function getDateTimeInZone(timezone: string): DateTime {
  return currentTime.value.setZone(timezone);
}

// Format date for a specific timezone
function formatDate(timezone: string): string {
  const dt = getDateTimeInZone(timezone);
  return dt.toFormat(dateFormat.value);
}

// Format time for a specific timezone
function formatTime(timezone: string): string {
  const dt = getDateTimeInZone(timezone);
  return dt.toFormat(timeFormat.value);
}

// Get timezone name abbreviation
function getTimezoneAbbr(timezone: string): string {
  const dt = getDateTimeInZone(timezone);
  return dt.toFormat('ZZZZ');
}

// Check if timezone is in daylight saving time using luxon
function isDaylightSaving(timezone: string): boolean {
  const dt = getDateTimeInZone(timezone);
  return dt.isInDST;
}

// Get offset from UTC
function getUtcOffset(timezone: string): string {
  const dt = getDateTimeInZone(timezone);
  const offset = dt.toFormat('ZZ');

  if (offset.endsWith(':00')) {
    return offset.slice(0, -3);
  }
  return offset;
}

// Add a new city
function addCity(city: CityInfo) {
  if (existingCityIds.value.has(city.id)) return;

  cities.value.push({ ...city });
  closeModal();
}

// Remove a city
function removeCity(index: number) {
  cities.value.splice(index, 1);
}

// Move city up in the order
function moveUp(index: number) {
  if (index === 0) return;
  const temp = cities.value[index];
  cities.value[index] = cities.value[index - 1];
  cities.value[index - 1] = temp;
}

// Move city down in the order
function moveDown(index: number) {
  if (index === cities.value.length - 1) return;
  const temp = cities.value[index];
  cities.value[index] = cities.value[index + 1];
  cities.value[index + 1] = temp;
}

// Reset to default cities
function resetToDefault() {
  cities.value = [{ id: 'local', city: 'Local', timezone: localTimezone }];
}

// Reset formats to default
function resetFormats() {
  dateFormat.value = DEFAULT_DATE_FORMAT;
  timeFormat.value = DEFAULT_TIME_FORMAT;
}

// Modal handling
function openModal() {
  showAddModal.value = true;
  searchQuery.value = '';
  selectedIndex.value = 0;
  nextTick(() => {
    searchInput.value?.focus();
  });
}

function closeModal() {
  showAddModal.value = false;
  searchQuery.value = '';
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeModal();
    return;
  }

  if (!filteredCities.value.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % filteredCities.value.length;
    scrollToSelected();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + filteredCities.value.length) % filteredCities.value.length;
    scrollToSelected();
  } else if (event.key === 'Enter' && filteredCities.value[selectedIndex.value]) {
    event.preventDefault();
    addCity(filteredCities.value[selectedIndex.value]);
  }
}

function scrollToSelected() {
  nextTick(() => {
    const selectedElement = document.querySelector('.city-result.selected');
    selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Header with format inputs and add button -->
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mb-4">
          <div class="flex flex-col sm:flex-row gap-4 flex-1 w-full lg:w-auto">
            <!-- Date Format Input -->
            <div class="form-control flex-1">
              <label class="label py-1">
                <span class="label-text">Date Format (Luxon)</span>
              </label>
              <input
                v-model="dateFormat"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="yyyy-LLL-dd, EEE"
              />
            </div>

            <!-- Time Format Input -->
            <div class="form-control flex-1">
              <label class="label py-1">
                <span class="label-text">Time Format (Luxon)</span>
              </label>
              <input
                v-model="timeFormat"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="HH:mm:ss"
              />
            </div>
          </div>

          <div class="flex gap-2">
            <button class="btn btn-sm btn-ghost" @click="resetFormats" title="Reset formats">
              <Icon icon="solar:refresh-bold" class="h-4 w-4" />
            </button>
            <button class="btn btn-sm btn-ghost" @click="resetToDefault" title="Reset cities">
              <Icon icon="solar:trash-bin-trash-bold" class="h-4 w-4" />
            </button>
            <button class="btn btn-sm btn-primary" @click="openModal">
              <Icon icon="solar:add-circle-bold" class="h-4 w-4" />
              Add City
            </button>
          </div>
        </div>

        <!-- Time cards grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="(cityInfo, index) in cities"
            :key="cityInfo.id + index"
            :class="[
              'card shadow-sm hover:shadow-md transition-all group h-64 bg-base-200',
              cityInfo.city === 'Local' ? 'border-2 border-primary' : '',
            ]"
          >
            <div class="card-body p-4 flex flex-col justify-between h-full gap-4">
              <!-- Header with city name -->
              <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold">{{ cityInfo.city }}</h2>
                <span class="badge badge-neutral badge-sm font-mono">
                  {{ getUtcOffset(cityInfo.timezone) }}
                </span>
              </div>

              <!-- Time display (hero element) -->
              <div class="flex-1 flex">
                <div class="text-5xl font-mono font-bold tracking-tighter">
                  {{ formatTime(cityInfo.timezone) }}
                </div>
              </div>

              <!-- Bottom section: date, location, timezone info -->
              <div class="border-t border-base-content/10 pt-3 space-y-2">
                <!-- Date display -->
                <div class="text-lg font-semibold opacity-90">
                  {{ formatDate(cityInfo.timezone) }}
                </div>

                <!-- Country and province display (if available) -->
                <div v-if="cityInfo.country || cityInfo.province" class="text-sm text-base-content/50">
                  <span v-if="cityInfo.province">{{ cityInfo.province }}, </span>
                  <span v-if="cityInfo.country">{{ cityInfo.country }}</span>
                </div>

                <!-- Timezone info -->
                <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/50">
                  <span v-if="isDaylightSaving(cityInfo.timezone)" class="badge badge-warning badge-xs">
                    <Icon icon="mdi:sun-clock" class="h-3 w-3 mr-0.5" />
                  </span>
                  <span class="font-mono">{{ cityInfo.timezone }} ({{ getTimezoneAbbr(cityInfo.timezone) }})</span>
                </div>

                <!--action -->
                <div class="flex justify-end">
                  <div class="join opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="btn btn-ghost btn-xs join-item"
                      :disabled="index === 0"
                      @click="moveUp(index)"
                      title="Move up"
                    >
                      <Icon icon="solar:arrow-up-bold" class="h-3 w-3" />
                    </button>
                    <button
                      class="btn btn-ghost btn-xs join-item"
                      :disabled="index === cities.length - 1"
                      @click="moveDown(index)"
                      title="Move down"
                    >
                      <Icon icon="solar:arrow-down-bold" class="h-3 w-3" />
                    </button>
                    <button
                      v-if="cities.length > 1"
                      class="btn btn-ghost btn-xs join-item text-error"
                      @click="removeCity(index)"
                      title="Remove"
                    >
                      <Icon icon="solar:trash-bin-trash-bold" class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="cities.length === 0" class="text-center py-12">
          <Icon icon="solar:clock-circle-bold" class="h-12 w-12 mx-auto text-base-content/30 mb-4" />
          <p class="text-base-content/50">No cities added. Click "Add City" to get started.</p>
        </div>
      </div>
    </div>

    <!-- Add City Modal with Search -->
    <Transition appear name="modal">
      <div
        v-if="showAddModal"
        class="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
        @click="closeModal"
      >
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div
          class="relative w-full max-w-2xl bg-base-100 rounded-lg shadow-2xl border border-base-200 overflow-hidden"
          @click.stop
        >
          <div class="p-4 border-b border-base-200">
            <div class="relative">
              <label class="input w-full">
                <Icon icon="tabler:search" />
                <input
                  v-model="searchQuery"
                  ref="searchInput"
                  type="text"
                  placeholder="Search for a city... (Esc to close)"
                  class="w-full input-bordered text-lg"
                  autofocus
                  @keydown="handleKeyDown"
                />
              </label>
            </div>
          </div>

          <div class="max-h-[50vh] overflow-y-auto">
            <div v-if="!searchQuery" class="p-8 text-center text-base-content/60">
              <Icon icon="material-symbols:search" class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Type to search for cities</p>
              <p class="text-sm mt-2">Try searching by city name, country, or timezone</p>
            </div>
            <div v-else-if="filteredCities.length === 0" class="p-8 text-center text-base-content/60">
              <Icon icon="material-symbols:search-off" class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No cities found for "{{ searchQuery }}"</p>
              <p class="text-sm mt-2">Or all matching cities have already been added</p>
            </div>

            <div v-else class="divide-y divide-base-200">
              <div
                v-for="(city, index) in filteredCities"
                :key="city.id"
                @click="addCity(city)"
                :class="[
                  'city-result p-4 cursor-pointer transition-colors',
                  index === selectedIndex ? 'selected bg-primary/10' : 'hover:bg-base-200',
                ]"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center shrink-0">
                    <Icon icon="mdi:city" class="w-6 h-6" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold truncate" v-html="highlightText(city.city)"></h3>
                    <p class="text-sm text-base-content/60 line-clamp-1">
                      <span v-if="city.province" v-html="highlightText(city.province)"></span>
                      <span v-if="city.province && city.country" class="mx-1">•</span>
                      <span v-if="city.country" v-html="highlightText(city.country)"></span>
                      <span v-if="city.province || city.country" class="mx-1">•</span>
                      <span class="font-mono text-xs" v-html="highlightText(city.timezone)"></span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="p-3 border-t border-base-200 bg-base-200/50 text-xs text-base-content/50 flex justify-between">
            <span v-if="filteredCities.length > 0">{{ filteredCities.length }} results</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

.modal-enter-to .relative,
.modal-leave-from .relative {
  transform: scale(1) translateY(0);
  opacity: 1;
}

.city-result.selected {
  background-color: oklch(var(--p) / 0.1);
}
</style>
