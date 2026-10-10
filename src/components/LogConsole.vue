<template>
  <q-card bordered class="q-pa-none column log-console">
    <div class="row items-center no-wrap q-gutter-x-xs q-px-xs bg-grey-3 border-bottom toolbar">
      <div class="text-caption text-bold q-mr-sm">Log Console</div>

      <q-btn
        v-for="lvl in levelButtons" :key="lvl.value"
        dense no-caps size="sm"
        :unelevated="visibleLevels.includes(lvl.value)"
        :flat="!visibleLevels.includes(lvl.value)"
        :color="visibleLevels.includes(lvl.value) ? lvl.color : 'grey-7'"
        class="q-px-xs"
        @click="toggleLevel(lvl.value)"
      >
        {{ lvl.label }}<span v-if="counts[lvl.value]" class="level-count">{{ counts[lvl.value] }}</span>
        <q-tooltip>{{ lvl.tooltip }}</q-tooltip>
      </q-btn>

      <q-input v-model="filterText" dense borderless clearable placeholder="Filter…" class="col filter-input q-px-xs">
        <template #prepend><q-icon name="search" size="xs" /></template>
      </q-input>

      <q-toggle
        :model-value="store.frameLogEnabled" dense size="sm" label="Hex TX/RX"
        class="text-caption q-mr-xs"
        @update:model-value="(v: boolean) => store.setFrameLog(v)"
      >
        <q-tooltip>Capture raw request/response bytes (RTU CRC is checked, TCP MBAP header is dimmed)</q-tooltip>
      </q-toggle>
      <q-btn dense flat size="sm" icon="vertical_align_bottom" :color="follow ? 'primary' : 'grey-7'" @click="toggleFollow">
        <q-tooltip>{{ follow ? 'Auto-scroll on' : 'Auto-scroll off – click to jump to the end' }}</q-tooltip>
      </q-btn>
      <q-btn dense flat size="sm" icon="content_copy" color="grey-8" :disable="!filtered.length" @click="copy">
        <q-tooltip>Copy shown lines</q-tooltip>
      </q-btn>
      <q-btn dense flat size="sm" icon="delete_sweep" color="grey-8" :disable="!store.logs.length" @click="store.clearLogs()">
        <q-tooltip>Clear</q-tooltip>
      </q-btn>
    </div>

    <div ref="scroller" class="col q-pa-xs log-body" @scroll="onScroll">
      <div v-for="log in filtered" :key="log.id" class="log-line" :class="`lvl-${log.level}`">
        <span class="ts">{{ formatTime(log.ts) }}</span>
        <template v-if="log.frame">
          <span class="dir">{{ log.level === 'tx' ? 'TX ▶' : 'RX ◀' }}</span>
          <template v-for="(seg, i) in frameView(log.frame).segments" :key="i">
            <span :class="seg.cls">{{ seg.text }}</span>{{ ' ' }}
          </template>
          <span class="meta" :class="{ 'meta-warn': log.frame.note }">{{ frameView(log.frame).meta }}</span>
        </template>
        <span v-else class="msg">{{ log.message }}</span>
      </div>
      <div v-if="!filtered.length" class="text-grey-6 text-italic">
        {{ store.logs.length ? 'No lines match the filter.' : 'No log messages yet.' }}
      </div>
    </div>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch, nextTick } from 'vue';
import { copyToClipboard, useQuasar } from 'quasar';
import { useModbusStore, type LogEntry, type LogLevel } from 'stores/modbus-store';
import type { RawFrame } from 'src/my-api';

const LEVELS_KEY = 'modbus_log_levels';
const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'tx', 'rx'];

const levelButtons: { value: LogLevel; label: string; color: string; tooltip: string }[] = [
  { value: 'info', label: 'Info', color: 'blue-grey-6', tooltip: 'Informational messages' },
  { value: 'warn', label: 'Warn', color: 'orange-8', tooltip: 'Warnings (busy, aborted, timeouts)' },
  { value: 'error', label: 'Error', color: 'negative', tooltip: 'Errors and exceptions' },
  { value: 'tx', label: 'TX', color: 'indigo-6', tooltip: 'Raw sent frames' },
  { value: 'rx', label: 'RX', color: 'teal-7', tooltip: 'Raw received frames' },
];

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const hexBytes = (bytes: number[]) => bytes.map(hex).join(' ');

function crc16(bytes: number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

interface FrameView {
  segments: { text: string; cls: string }[];
  meta: string;
}

// Frames never change once logged, so their rendering is computed once
const viewCache = new WeakMap<RawFrame, FrameView>();

function frameView(f: RawFrame): FrameView {
  const cached = viewCache.get(f);
  if (cached) return cached;

  const b = f.bytes;
  const segments: FrameView['segments'] = [];
  const meta: string[] = [`${b.length} B`];
  let fcIndex = -1;

  if (f.proto === 'tcp' && b.length >= 7) {
    // MBAP header (transaction, protocol, length, unit) | PDU
    segments.push({ text: hexBytes(b.slice(0, 7)), cls: 'hdr' });
    if (b.length > 7) segments.push({ text: hexBytes(b.slice(7)), cls: 'pdu' });
    fcIndex = 7;
  } else if (f.proto === 'rtu' && b.length >= 4) {
    // Address + PDU | CRC (little endian)
    const body = b.slice(0, -2);
    const crcOk = crc16(body) === (b[b.length - 2] | (b[b.length - 1] << 8));
    segments.push({ text: hexBytes(body), cls: 'pdu' });
    segments.push({ text: hexBytes(b.slice(-2)), cls: crcOk ? 'crc' : 'crc-bad' });
    meta.push(crcOk ? 'CRC OK' : `CRC BAD (expected ${hexBytes([crc16(body) & 0xff, crc16(body) >> 8])})`);
    fcIndex = 1;
  } else if (b.length) {
    segments.push({ text: hexBytes(b), cls: 'pdu' });
  }

  if (fcIndex >= 0 && b.length > fcIndex + 1 && b[fcIndex] & 0x80) {
    meta.push(`exception ${b[fcIndex + 1]} (FC ${b[fcIndex] & 0x7f})`);
  }
  if (f.elapsedMs != null) meta.push(`${f.elapsedMs} ms`);
  if (f.note) meta.push(f.note);

  const view = { segments, meta: `(${meta.join(', ')})` };
  viewCache.set(f, view);
  return view;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function lineText(log: LogEntry): string {
  if (!log.frame) return log.message;
  const v = frameView(log.frame);
  return `${log.level.toUpperCase()} ${v.segments.map((s) => s.text).join(' ')} ${v.meta}`.replace(/\s+/g, ' ');
}

function loadLevels(): LogLevel[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(LEVELS_KEY) || 'null');
    if (Array.isArray(saved)) return ALL_LEVELS.filter((l) => saved.includes(l));
  } catch { /* fall through */ }
  return [...ALL_LEVELS];
}

export default defineComponent({
  name: 'LogConsole',
  setup() {
    const store = useModbusStore();
    const $q = useQuasar();

    const visibleLevels = ref<LogLevel[]>(loadLevels());
    const filterText = ref<string | null>('');
    const follow = ref(true);
    const scroller = ref<HTMLElement | null>(null);

    function toggleLevel(level: LogLevel) {
      const set = visibleLevels.value;
      visibleLevels.value = set.includes(level) ? set.filter((l) => l !== level) : [...set, level];
      localStorage.setItem(LEVELS_KEY, JSON.stringify(visibleLevels.value));
    }

    const counts = computed(() => {
      const c: Partial<Record<LogLevel, number>> = {};
      for (const log of store.logs) c[log.level] = (c[log.level] ?? 0) + 1;
      return c;
    });

    const filtered = computed(() => {
      const levels = new Set(visibleLevels.value);
      const needle = (filterText.value ?? '').trim().toLowerCase();
      return store.logs.filter((log) =>
        levels.has(log.level) && (!needle || lineText(log).toLowerCase().includes(needle)));
    });

    function scrollToEnd() {
      const el = scroller.value;
      if (el) el.scrollTop = el.scrollHeight;
    }

    function onScroll() {
      const el = scroller.value;
      if (el) follow.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    }

    function toggleFollow() {
      follow.value = !follow.value;
      if (follow.value) scrollToEnd();
    }

    // The last entry changes on every new line, also once the log is at its size limit
    watch(() => [filtered.value.length, store.logs[store.logs.length - 1]?.id], () => {
      if (follow.value) void nextTick(scrollToEnd);
    });

    async function copy() {
      const text = filtered.value.map((log) => `${formatTime(log.ts)} ${lineText(log)}`).join('\n');
      try {
        await copyToClipboard(text);
        $q.notify({ type: 'positive', message: `Copied ${filtered.value.length} lines`, timeout: 1200 });
      } catch {
        $q.notify({ type: 'negative', message: 'Copy to clipboard failed' });
      }
    }

    return {
      store, levelButtons, visibleLevels, toggleLevel, counts, filterText, filtered,
      follow, toggleFollow, onScroll, scroller, copy, frameView, formatTime,
    };
  },
});
</script>

<style scoped>
.log-console {
  height: 260px;
  min-height: 120px;
  resize: vertical;
  overflow: hidden;
}
.toolbar {
  min-height: 32px;
}
.filter-input {
  min-width: 100px;
  max-width: 260px;
}
.filter-input :deep(.q-field__control),
.filter-input :deep(.q-field__marginal) {
  height: 28px;
  font-size: 12px;
}
.level-count {
  font-size: 10px;
  margin-left: 4px;
  opacity: 0.75;
}
.log-body {
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.45;
}
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.ts {
  color: #9e9e9e;
  margin-right: 8px;
}
.dir {
  font-weight: bold;
  margin-right: 8px;
}
.lvl-warn .msg { color: #e65100; }
.lvl-error .msg { color: #c10015; }
.lvl-tx .dir { color: #3949ab; }
.lvl-rx .dir { color: #00796b; }
.hdr { color: #9e9e9e; }
.crc { color: #757575; text-decoration: underline dotted; }
.crc-bad { color: #c10015; font-weight: bold; text-decoration: underline wavy; }
.meta { color: #8d8d8d; margin-left: 4px; }
.meta-warn { color: #e65100; }
</style>
