<template>
  <q-card bordered class="q-pa-md q-mb-md">
    <div class="row items-center q-gutter-sm">
      <div class="text-h6">Trend</div>
      <q-space />
      <q-btn-toggle
        v-model="windowSec"
        :options="windowOptions"
        dense no-caps unelevated toggle-color="primary" size="sm"
      />
      <q-btn
        :icon="paused ? 'play_arrow' : 'pause'"
        :color="paused ? 'positive' : 'grey-8'"
        flat round dense
        @click="setPaused(!paused)"
      >
        <q-tooltip>{{ paused ? 'Resume' : 'Pause' }}</q-tooltip>
      </q-btn>
      <q-btn icon="delete_sweep" color="grey-8" flat round dense @click="trend.clear()">
        <q-tooltip>Clear history</q-tooltip>
      </q-btn>
      <q-btn icon="file_download" color="grey-8" flat round dense :disable="!trend.plotted.length" @click="exportCsv">
        <q-tooltip>Export plotted series to CSV</q-tooltip>
      </q-btn>
    </div>

    <!-- Plotted series -->
    <div class="row items-center q-gutter-xs q-mt-sm">
      <q-chip
        v-for="p in trend.plotted"
        :key="p.key"
        removable dense
        @remove="trend.togglePlotted(p.key)"
      >
        <span class="series-dot q-mr-xs" :style="{ background: SERIES_COLORS[p.slot] }" />
        {{ describe(p.key).label }}
        <q-icon v-if="!hasData(p.key)" name="warning" color="warning" class="q-ml-xs">
          <q-tooltip>No numeric samples yet: is polling running and does the value convert to a number?</q-tooltip>
        </q-icon>
      </q-chip>
      <q-select
        :model-value="null"
        :options="addOptions"
        :disable="!trend.canPlotMore() || !addOptions.length"
        emit-value map-options dense outlined
        label="Add series"
        style="min-width: 200px"
        @update:model-value="(k: string) => trend.togglePlotted(k)"
      />
    </div>

    <div ref="chartEl" class="q-mt-sm" @dblclick="setPaused(false)" />
    <div class="text-caption text-grey">
      Drag to zoom (pauses the live view), double-click to reset.
    </div>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useModbusStore } from 'stores/modbus-store';
import { useTrendStore, SERIES_COLORS } from 'stores/trend-store';
import { getDecoder } from 'src/decoders';

const CHART_HEIGHT = 320;

// uPlot's default time ticks are 12h (am/pm); [tick step s, format, then the date shown below the first tick of a new year/day]
const TIME_AXIS_VALUES: uPlot.Axis.Values = [
  [3600 * 24 * 365, '{YYYY}', null, null, null, null, null, null, 1],
  [3600 * 24 * 28, '{MMM}', '\n{YYYY}', null, null, null, null, null, 1],
  [3600 * 24, '{D}.{M}.', '\n{YYYY}', null, null, null, null, null, 1],
  [3600, '{H}:{mm}', '\n{D}.{M}.{YYYY}', null, '\n{D}.{M}.', null, null, null, 1],
  [60, '{H}:{mm}', '\n{D}.{M}.{YYYY}', null, '\n{D}.{M}.', null, null, null, 1],
  [1, '{H}:{mm}:{ss}', '\n{D}.{M}.{YYYY}', null, '\n{D}.{M}.', null, null, null, 1],
  [0.001, '{H}:{mm}:{ss}.{fff}', '\n{D}.{M}.{YYYY}', null, '\n{D}.{M}.', null, null, null, 1],
];

export default defineComponent({
  name: 'TrendChart',
  setup() {
    const $q = useQuasar();
    const store = useModbusStore();
    const trend = useTrendStore();

    const chartEl = ref<HTMLElement | null>(null);
    const windowSec = ref(600);
    const paused = ref(false);
    const windowOptions = [
      { label: '1 min', value: 60 },
      { label: '10 min', value: 600 },
      { label: '1 h', value: 3600 },
      { label: 'All', value: 0 },
    ];

    /** Human readable name and unit of a series key */
    function describe(key: string): { label: string; unit: string } {
      const [kind, id, ...rest] = key.split(':');
      if (kind === 'col') {
        const c = store.collectors.find(x => x.id === id);
        return { label: c?.name || 'Collector', unit: '' };
      }
      const field = rest.join(':');
      const d = store.devices.find(x => x.id === id);
      const unit = d ? getDecoder(d.decoderId)?.fields.find(f => f.name === field)?.unit ?? '' : '';
      return { label: `${d?.name ?? 'Device'} · ${field}`, unit };
    }

    const addOptions = computed(() => {
      void trend.version; // new series appear with their first sample
      return trend.keys()
        .filter(k => !trend.isPlotted(k))
        .map(k => ({ label: describe(k).label, value: k }));
    });

    function hasData(key: string) {
      void trend.version;
      return !!trend.get(key)?.t.length;
    }

    /** Index of the first timestamp >= t */
    function lowerBound(ts: number[], t: number) {
      let lo = 0, hi = ts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ts[mid] < t) lo = mid + 1; else hi = mid;
      }
      return lo;
    }

    /** Plotted series aligned on one time axis [ms]; missing samples are null */
    function joined(fromMs: number): uPlot.AlignedData {
      const tables = trend.plotted.map(p => {
        const b = trend.get(p.key);
        if (!b) return [[], []] as uPlot.AlignedData;
        const i = lowerBound(b.t, fromMs);
        return [b.t.slice(i), b.v.slice(i)] as uPlot.AlignedData;
      });
      return tables.length ? uPlot.join(tables) : [[]];
    }

    function chartData(): uPlot.AlignedData {
      const data = joined(windowSec.value ? Date.now() - windowSec.value * 1000 : -Infinity);
      // uPlot works in seconds
      return [(data[0] as number[]).map(t => t / 1000), ...data.slice(1)] as uPlot.AlignedData;
    }

    let chart: uPlot | null = null;

    function build() {
      chart?.destroy();
      chart = null;
      if (!chartEl.value || !trend.plotted.length) return;

      const opts: uPlot.Options = {
        width: chartEl.value.clientWidth || 600,
        height: CHART_HEIGHT,
        cursor: { drag: { x: true, y: false } },
        scales: { x: { time: true } },
        axes: [
          { stroke: '#666', grid: { stroke: '#eee' }, ticks: { stroke: '#ddd' }, values: TIME_AXIS_VALUES },
          { stroke: '#666', grid: { stroke: '#eee' }, ticks: { stroke: '#ddd' }, size: 60 },
        ],
        series: [
          { value: '{D}.{M}.{YYYY} {H}:{mm}:{ss}' },
          ...trend.plotted.map(p => {
            const { label, unit } = describe(p.key);
            return {
              label: unit ? `${label} [${unit}]` : label,
              stroke: SERIES_COLORS[p.slot],
              width: 2,
              spanGaps: true,
            };
          }),
        ],
        hooks: {
          // A drag-zoom freezes the view so new samples do not reset it
          setSelect: [u => { if (u.select.width > 0) paused.value = true; }],
        },
      };
      chart = new uPlot(opts, chartData(), chartEl.value);
    }

    let frame = 0;
    function scheduleUpdate() {
      if (paused.value || !chart || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        chart?.setData(chartData());
      });
    }

    function setPaused(v: boolean) {
      paused.value = v;
      if (!v) scheduleUpdate();
    }

    // Series added/removed/recolored or renamed → rebuild; new samples → just new data
    watch(
      () => trend.plotted.map(p => `${p.key}#${p.slot}#${describe(p.key).label}`).join('|'),
      build,
      { flush: 'post' },
    );
    watch(() => trend.version, scheduleUpdate);
    watch(windowSec, () => { if (chart) chart.setData(chartData()); });

    let resizeObserver: ResizeObserver | null = null;
    onMounted(() => {
      build();
      resizeObserver = new ResizeObserver(() => {
        if (chart && chartEl.value?.clientWidth) chart.setSize({ width: chartEl.value.clientWidth, height: CHART_HEIGHT });
      });
      if (chartEl.value) resizeObserver.observe(chartEl.value);
    });
    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      chart?.destroy();
      chart = null;
    });

    function csvCell(s: string) {
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    async function exportCsv() {
      const data = joined(-Infinity);
      const header = ['time', ...trend.plotted.map(p => {
        const { label, unit } = describe(p.key);
        return unit ? `${label} [${unit}]` : label;
      })];
      const lines = [header.map(csvCell).join(',')];
      const ts = data[0] as number[];
      ts.forEach((t, i) => {
        const d = new Date(t);
        const time = `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
        lines.push([time, ...data.slice(1).map(col => {
          const v = (col as (number | null | undefined)[])[i];
          return v == null ? '' : String(v);
        })].join(','));
      });
      const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
      const res = await window.myAPI.exportCsv(lines.join('\n') + '\n', `trend-${stamp}.csv`);
      if (!res.success && res.error !== 'Cancelled') {
        $q.notify({ type: 'negative', message: 'Export failed: ' + res.error });
      }
    }

    return { trend, chartEl, windowSec, windowOptions, paused, setPaused, addOptions, describe, hasData, exportCsv, SERIES_COLORS };
  }
});
</script>

<style scoped>
.series-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
