<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import {
  METHODS,
  errorTitle,
  formatBytes,
  formatMs,
  friendlyError,
  headersToObject,
  normalizeUrl,
  scoreGrade,
  statusClass,
  validateForm,
  waterfall,
  waterfallScale,
  type ApiError,
  type HeaderRow,
  type InspectRequest,
  type InspectResponse,
  type Method,
} from "./http-inspector";

const url = ref("https://example.com");
const method = ref<Method>("GET");
const headers = ref<HeaderRow[]>([{ name: "Accept", value: "*/*" }]);
const body = ref("");
const follow = ref(true);
const insecure = ref(false);
const httpVersion = ref<InspectRequest["http_version"]>("auto");

const busy = ref(false);
const formError = ref("");
const failure = ref<{ title: string; message: string } | null>(null);
const result = ref<InspectResponse | null>(null);
const openHop = ref(0);

const hasBody = computed(() => method.value !== "GET" && method.value !== "HEAD");
const scale = computed(() => (result.value ? waterfallScale(result.value.hops) : 0));
const finalHop = computed(() => result.value?.hops[result.value.hops.length - 1]);

const segmentColors: Record<string, string> = {
  dns: "bg-info",
  connect: "bg-warning",
  tls: "bg-secondary",
  ttfb: "bg-primary",
  transfer: "bg-success",
};

function addHeader() {
  headers.value.push({ name: "", value: "" });
}
function removeHeader(i: number) {
  headers.value.splice(i, 1);
}

async function inspect() {
  formError.value = validateForm(url.value, hasBody.value ? body.value : "");
  if (formError.value) return;
  const payload: InspectRequest = {
    url: normalizeUrl(url.value),
    method: method.value,
    headers: headersToObject(headers.value),
    body: hasBody.value ? body.value : "",
    follow_redirects: follow.value,
    insecure_skip_verify: insecure.value,
    http_version: httpVersion.value,
  };
  busy.value = true;
  failure.value = null;
  result.value = null;
  openHop.value = 0;
  try {
    const resp = await fetch("/api/net/http", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      let err: Partial<ApiError> | null = null;
      try {
        err = await resp.json();
      } catch {
        /* non-JSON error body */
      }
      failure.value = {
        title: errorTitle(err?.code),
        message: friendlyError(resp.status, err, resp.headers.get("Retry-After")),
      };
      return;
    }
    const data: InspectResponse = await resp.json();
    result.value = data;
    openHop.value = data.hops.length - 1;
    if (data.error) {
      failure.value = { title: errorTitle(data.error.code), message: data.error.message };
    }
  } catch {
    failure.value = {
      title: "Network error",
      message: "Could not reach the server. Check your connection and try again.",
    };
  } finally {
    busy.value = false;
  }
}

function copy(value: string) {
  navigator.clipboard.writeText(value);
}

const badgeClasses = {
  success: "badge-success",
  info: "badge-info",
  warning: "badge-warning",
  error: "badge-error",
} as const;
const textClasses = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
} as const;
const statusBadge = (s: number) => badgeClasses[statusClass(s)];
const itemBadge = (s: string) =>
  s === "pass" ? "badge-success" : s === "warn" ? "badge-warning" : "badge-error";
</script>

<template>
  <div class="tool-content flex justify-center">
    <div class="card bg-base-100 w-full">
      <div class="card-body">
        <div class="flex flex-col gap-4">
          <!-- Request -->
          <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="inspect">
            <select v-model="method" class="select select-bordered select-sm sm:w-28">
              <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
            </select>
            <input
              v-model="url"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="https://example.com"
              class="input input-bordered input-sm flex-1 min-w-0 font-mono"
              :class="{ 'input-error': formError }"
            />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="busy">
              <span v-if="busy" class="loading loading-spinner loading-xs"></span>
              <Icon v-else icon="solar:play-bold" class="h-4 w-4" />
              Inspect
            </button>
          </form>
          <div v-if="formError" class="text-error text-sm">{{ formError }}</div>

          <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label class="label cursor-pointer gap-2 p-0">
              <input v-model="follow" type="checkbox" class="toggle toggle-primary toggle-sm" />
              <span class="label-text">Follow redirects (max 10)</span>
            </label>
            <label class="label cursor-pointer gap-2 p-0">
              <span class="label-text">HTTP version</span>
              <select v-model="httpVersion" class="select select-bordered select-xs">
                <option value="auto">Auto</option>
                <option value="h1">HTTP/1.1</option>
                <option value="h2">HTTP/2</option>
              </select>
            </label>
            <label class="label cursor-pointer gap-2 p-0">
              <input v-model="insecure" type="checkbox" class="toggle toggle-warning toggle-sm" />
              <span class="label-text">Skip TLS verification</span>
            </label>
          </div>
          <div v-if="insecure" class="alert alert-warning py-2 text-sm">
            <Icon icon="solar:danger-triangle-bold" class="h-5 w-5 shrink-0" />
            Certificate checks are disabled. The server's identity will not be verified.
          </div>

          <!-- Headers -->
          <div class="form-control">
            <div class="flex items-center justify-between mb-1">
              <span class="label-text font-medium">Request headers</span>
              <button type="button" class="btn btn-xs btn-ghost" @click="addHeader">
                <Icon icon="solar:add-circle-bold" class="h-4 w-4" /> Add
              </button>
            </div>
            <div v-for="(h, i) in headers" :key="i" class="flex gap-2 mb-1">
              <input
                v-model="h.name"
                type="text"
                placeholder="Name"
                spellcheck="false"
                class="input input-bordered input-xs w-2/5 font-mono"
              />
              <input
                v-model="h.value"
                type="text"
                placeholder="Value"
                spellcheck="false"
                class="input input-bordered input-xs flex-1 min-w-0 font-mono"
              />
              <button
                type="button"
                class="btn btn-xs btn-ghost"
                title="Remove"
                @click="removeHeader(i)"
              >
                <Icon icon="solar:trash-bin-minimalistic-bold" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div v-if="hasBody" class="form-control">
            <span class="label-text font-medium mb-1">Body (max 64 KB)</span>
            <textarea
              v-model="body"
              spellcheck="false"
              class="textarea textarea-bordered w-full h-24 font-mono text-sm"
              placeholder="Request body"
            ></textarea>
          </div>

          <!-- Failure -->
          <div v-if="failure" class="alert alert-error py-2">
            <Icon icon="solar:danger-circle-bold" class="h-5 w-5 shrink-0" />
            <div>
              <div class="font-medium">{{ failure.title }}</div>
              <div class="text-sm break-words">{{ failure.message }}</div>
            </div>
          </div>

          <template v-if="result && result.hops.length">
            <div v-for="w in result.warnings" :key="w" class="alert alert-warning py-2 text-sm">
              <Icon icon="solar:danger-triangle-bold" class="h-5 w-5 shrink-0" />
              {{ w }}
            </div>

            <!-- Chain -->
            <div class="divider my-0">
              Redirect chain
              <span class="badge badge-neutral badge-sm">{{ formatMs(result.total_ms) }}</span>
            </div>
            <ol class="flex flex-col gap-2">
              <li
                v-for="(h, i) in result.hops"
                :key="i"
                class="border border-base-content/20 rounded-btn"
              >
                <button
                  type="button"
                  class="w-full text-left p-2 flex flex-wrap items-center gap-2"
                  @click="openHop = openHop === i ? -1 : i"
                >
                  <span class="badge badge-sm badge-outline">{{ i + 1 }}</span>
                  <span class="badge badge-sm" :class="statusBadge(h.status)">
                    {{ h.status }} {{ h.status_text }}
                  </span>
                  <span class="badge badge-sm badge-ghost">{{ h.method }}</span>
                  <span class="font-mono text-xs break-all flex-1 min-w-0">{{ h.url }}</span>
                  <span class="text-xs text-base-content/60">{{
                    formatMs(h.timings.total_ms)
                  }}</span>
                </button>
                <div v-if="h.location" class="px-2 pb-1 text-xs text-base-content/60 break-all">
                  Location: <span class="font-mono">{{ h.location }}</span>
                </div>

                <div class="px-2 pb-2">
                  <!-- waterfall -->
                  <div class="relative h-3 bg-base-200 rounded overflow-hidden">
                    <div
                      v-for="s in waterfall(h.timings, scale)"
                      :key="s.key"
                      class="absolute top-0 h-full"
                      :class="segmentColors[s.key]"
                      :style="{
                        left: `${s.left}%`,
                        width: `${Math.max(s.width, s.ms > 0 ? 0.5 : 0)}%`,
                      }"
                      :title="`${s.label}: ${formatMs(s.ms)}`"
                    ></div>
                  </div>
                </div>

                <div v-if="openHop === i" class="px-2 pb-3 flex flex-col gap-3">
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span class="badge badge-sm badge-neutral">{{ h.protocol }}</span>
                    <span v-if="h.remote_ip" class="font-mono">IP {{ h.remote_ip }}</span>
                    <span v-if="h.tls">{{ h.tls.version }} / {{ h.tls.cipher_suite }}</span>
                    <span v-if="h.tls && !h.tls.verified" class="text-warning font-medium">
                      certificate NOT verified
                    </span>
                  </div>
                  <div v-if="h.tls?.subject" class="text-xs text-base-content/70 break-all">
                    Cert: {{ h.tls.subject }} (issuer {{ h.tls.issuer }}, expires
                    {{ h.tls.not_after }})
                  </div>

                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span
                      v-for="s in waterfall(h.timings, scale)"
                      :key="s.key"
                      class="flex items-center gap-1"
                    >
                      <span
                        class="inline-block h-2 w-2 rounded-sm"
                        :class="segmentColors[s.key]"
                      ></span>
                      {{ s.label }} {{ formatMs(s.ms) }}
                    </span>
                  </div>

                  <div class="overflow-x-auto max-h-72 overflow-y-auto">
                    <table class="table table-xs table-pin-rows">
                      <thead>
                        <tr>
                          <th>Header</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(hd, j) in h.headers" :key="j">
                          <td class="font-mono text-xs whitespace-nowrap">{{ hd.name }}</td>
                          <td class="font-mono text-xs break-all">{{ hd.value }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </li>
            </ol>

            <!-- Security -->
            <template v-if="result.security">
              <div class="divider my-0">Security headers</div>
              <div class="flex items-center gap-3">
                <div
                  class="radial-progress text-sm font-bold"
                  :class="textClasses[scoreGrade(result.security.score).cls]"
                  :style="{ '--value': result.security.score, '--size': '4rem' }"
                  role="progressbar"
                  :aria-valuenow="result.security.score"
                >
                  {{ result.security.score }}
                </div>
                <div>
                  <div class="font-medium">Grade {{ scoreGrade(result.security.score).grade }}</div>
                  <div class="text-xs text-base-content/60">
                    Based on the final response ({{ finalHop?.status }})
                  </div>
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>Header</th>
                      <th>Status</th>
                      <th>Value / advice</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="it in result.security.items" :key="it.name">
                      <td class="font-mono text-xs whitespace-nowrap">{{ it.name }}</td>
                      <td>
                        <span class="badge badge-sm" :class="itemBadge(it.status)">{{
                          it.status
                        }}</span>
                      </td>
                      <td class="text-xs break-all">
                        <div v-if="it.value" class="font-mono">{{ it.value }}</div>
                        <div class="text-base-content/60">{{ it.message }}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- Cookies -->
            <template v-if="result.cookies.length">
              <div class="divider my-0">Cookies</div>
              <div class="overflow-x-auto">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Secure</th>
                      <th>HttpOnly</th>
                      <th>SameSite</th>
                      <th>Hints</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in result.cookies" :key="c.name">
                      <td class="font-mono text-xs">{{ c.name }}</td>
                      <td>{{ c.secure ? "yes" : "no" }}</td>
                      <td>{{ c.http_only ? "yes" : "no" }}</td>
                      <td>{{ c.same_site || "-" }}</td>
                      <td class="text-xs">
                        <div v-for="hint in c.hints" :key="hint">{{ hint }}</div>
                        <span v-if="!c.hints.length" class="text-success">OK</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- Body -->
            <template v-if="result.body">
              <div class="divider my-0">Response body</div>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="badge badge-sm badge-neutral">
                  {{ formatBytes(result.body.size) }}{{ result.body.size_capped ? "+" : "" }}
                </span>
                <span v-if="result.body.content_type" class="font-mono">{{
                  result.body.content_type
                }}</span>
                <span v-if="result.body.truncated && !result.body.is_binary" class="text-warning">
                  Preview truncated to the first 16 KB
                </span>
                <button
                  v-if="result.body.preview"
                  type="button"
                  class="btn btn-xs btn-ghost ml-auto"
                  title="Copy"
                  @click="copy(result.body.preview)"
                >
                  <Icon icon="solar:copy-bold" class="h-3 w-3" />
                </button>
              </div>
              <div v-if="result.body.is_binary" class="text-sm text-base-content/60">
                Binary content, preview not shown.
              </div>
              <div v-else-if="!result.body.preview" class="text-sm text-base-content/60">
                Empty body.
              </div>
              <pre
                v-else
                class="border border-base-content/20 rounded-btn p-3 font-mono text-sm whitespace-pre-wrap break-all max-h-96 overflow-auto bg-base-200/40"
                >{{ result.body.preview }}</pre>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
