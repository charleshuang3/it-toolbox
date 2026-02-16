<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { v4, v5, v7 } from 'uuid';

type UuidVersion = 'v4' | 'v5' | 'v7';

const version = ref<UuidVersion>('v4');
const count = ref(1);
const namespace = ref(v5.DNS); // DNS namespace by default
const name = ref('');
const results = ref<string[]>([]);

const predefinedNamespaces = [
  { label: 'DNS', value: v5.DNS },
  { label: 'URL', value: v5.URL },
  { label: 'OID', value: '6ba7b812-9dad-11d1-80b4-00c04fd430c8' },
  { label: 'X.500', value: '6ba7b814-9dad-11d1-80b4-00c04fd430c8' },
  { label: 'Custom', value: '' },
];

const selectedNamespace = ref('DNS');

const versionInfo = computed(() => {
  switch (version.value) {
    case 'v4':
      return 'Random UUID. Best for generating unique identifiers without any input data.';
    case 'v5':
      return 'Reproducible UUID from namespace + name. Same inputs always produce the same UUID.';
    case 'v7':
      return 'Time-ordered UUID. Sortable by generation time, ideal for databases.';
    default:
      return '';
  }
});

const maxCount = computed(() => {
  return version.value === 'v5' ? 1 : 20;
});

watch(selectedNamespace, (val) => {
  const found = predefinedNamespaces.find((ns) => ns.label === val);
  if (found && found.value) {
    namespace.value = found.value;
  }
});

watch(version, () => {
  if (version.value === 'v5' && count.value > 1) {
    count.value = 1;
  }
});

// Auto-correct count to valid range
watch(count, (val) => {
  if (val < 1) {
    count.value = 1;
  } else if (val > maxCount.value) {
    count.value = maxCount.value;
  }
});

function generate() {
  results.value = [];

  if (version.value === 'v5') {
    if (!namespace.value || !name.value) return;
    results.value = [v5(name.value, namespace.value)];
  } else if (version.value === 'v4') {
    for (let i = 0; i < count.value; i++) {
      results.value.push(v4());
    }
  } else if (version.value === 'v7') {
    for (let i = 0; i < count.value; i++) {
      results.value.push(v7());
    }
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function copyAll() {
  navigator.clipboard.writeText(results.value.join('\n'));
}
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <!-- Version selector -->
        <div class="form-control flex gap-1">
          <label class="label">
            <span class="label-text">UUID Version</span>
          </label>
          <div class="btn-group flex gap-1">
            <button
              class="btn flex-1"
              :class="version === 'v4' ? 'btn-primary' : 'btn-outline'"
              @click="version = 'v4'"
            >
              v4
            </button>
            <button
              class="btn flex-1"
              :class="version === 'v5' ? 'btn-primary' : 'btn-outline'"
              @click="version = 'v5'"
            >
              v5
            </button>
            <button
              class="btn flex-1"
              :class="version === 'v7' ? 'btn-primary' : 'btn-outline'"
              @click="version = 'v7'"
            >
              v7
            </button>
          </div>
        </div>

        <!-- Version info -->
        <div class="alert alert-info text-sm">
          <Icon icon="solar:info-circle-bold" class="h-5 w-5" />
          <span>{{ versionInfo }}</span>
        </div>

        <!-- Count input (not for v5) -->
        <div v-if="version !== 'v5'" class="form-control flex gap-2">
          <label class="label">
            <span class="label-text">Number of UUIDs</span>
          </label>
          <input
            v-model.number="count"
            type="number"
            class="input input-bordered"
            required
            min="1"
            :max="maxCount"
            :title="`Must be between 1 to ${maxCount}`"
          />
        </div>

        <!-- v5 specific inputs -->
        <template v-if="version === 'v5'">
          <div class="form-control">
            <label class="label">
              <span class="label-text">Namespace</span>
            </label>
            <div class="btn-group flex flex-wrap gap-1">
              <button
                v-for="ns in predefinedNamespaces"
                :key="ns.label"
                class="btn flex-1"
                :class="selectedNamespace === ns.label ? 'btn-primary' : 'btn-outline'"
                @click="selectedNamespace = ns.label"
              >
                {{ ns.label }}
              </button>
            </div>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text">Namespace UUID</span>
            </label>
            <input
              v-model="namespace"
              type="text"
              class="input input-bordered w-full font-mono text-sm"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text">Name</span>
            </label>
            <input
              v-model="name"
              type="text"
              class="input input-bordered w-full"
              placeholder="Enter name for UUID generation"
            />
          </div>
        </template>

        <!-- Generate button -->
        <div class="flex mt-1">
          <button class="btn btn-primary" :disabled="version === 'v5' && (!namespace || !name)" @click="generate">
            <Icon icon="solar:refresh-bold" class="h-5 w-5" />
            Generate
          </button>
        </div>

        <div class="divider"></div>

        <!-- Results -->
        <div v-if="results.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Results</span>
            <button v-if="results.length > 1" class="btn btn-sm btn-ghost" @click="copyAll">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
              Copy All
            </button>
          </div>
          <div v-for="(uuid, index) in results" :key="index" class="flex items-center gap-2">
            <input type="text" :value="uuid" readonly class="input input-bordered flex-1 font-mono text-sm" />
            <button class="btn btn-circle btn-sm" @click="copyToClipboard(uuid)">
              <Icon icon="solar:copy-bold" class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div v-else class="text-center text-base-content/50 py-8">Click "Generate" to create UUIDs</div>
      </div>
    </div>
  </div>
</template>
