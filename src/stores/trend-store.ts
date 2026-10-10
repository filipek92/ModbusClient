import { defineStore } from 'pinia';
import { ref } from 'vue';

// History of polled values for the trend chart. The buffers are deliberately not reactive
// (thousands of points would be tracked one by one); `version` is bumped on every change instead.

/** Max points kept per series; the oldest are dropped. */
export const MAX_POINTS = 20000;

/** Categorical series colors in fixed order; also the limit of series in one chart. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export interface PlottedSeries {
  key: string;
  /** Index into SERIES_COLORS, kept while plotted so removing another series does not repaint it */
  slot: number;
}

export interface SeriesBuffer {
  t: number[]; // timestamps [ms]
  v: number[];
}

/** Keys: `col:<collectorId>` or `dev:<deviceId>:<fieldName>` */
export const collectorKey = (id: string) => `col:${id}`;
export const deviceKey = (id: string) => `dev:${id}`;
export const deviceFieldKey = (deviceId: string, field: string) => `${deviceKey(deviceId)}:${field}`;

export const useTrendStore = defineStore('trend', () => {
  const buffers = new Map<string, SeriesBuffer>();
  const version = ref(0);
  const plotted = ref<PlottedSeries[]>([]);

  /** Stores a sample; values that are not a finite number or boolean are ignored. */
  function record(key: string, value: unknown, t = Date.now()) {
    let n: number;
    if (typeof value === 'number') n = value;
    else if (typeof value === 'boolean') n = value ? 1 : 0;
    // A collector conversion often leaves a single register in the array
    else if (Array.isArray(value) && value.length === 1) return record(key, value[0], t);
    else return;
    if (!Number.isFinite(n)) return;

    let buf = buffers.get(key);
    if (!buf) {
      buf = { t: [], v: [] };
      buffers.set(key, buf);
    }
    buf.t.push(t);
    buf.v.push(n);
    if (buf.t.length > MAX_POINTS) {
      // Drop in chunks so the shift does not run on every sample
      const drop = buf.t.length - MAX_POINTS + 1000;
      buf.t.splice(0, drop);
      buf.v.splice(0, drop);
    }
    version.value++;
  }

  function get(key: string): SeriesBuffer | undefined {
    return buffers.get(key);
  }

  /** Keys of all series that have at least one sample. */
  function keys(): string[] {
    return [...buffers.keys()];
  }

  function isPlotted(key: string) {
    return plotted.value.some(p => p.key === key);
  }

  function canPlotMore() {
    return plotted.value.length < SERIES_COLORS.length;
  }

  function togglePlotted(key: string) {
    if (isPlotted(key)) {
      plotted.value = plotted.value.filter(p => p.key !== key);
      return;
    }
    const used = new Set(plotted.value.map(p => p.slot));
    const slot = SERIES_COLORS.findIndex((_, i) => !used.has(i));
    if (slot < 0) return;
    plotted.value = [...plotted.value, { key, slot }];
  }

  /** Removes series `key` and all its sub-series (`forget('dev:<id>')` drops every field of the device). */
  function forget(key: string) {
    const match = (k: string) => k === key || k.startsWith(key + ':');
    for (const k of [...buffers.keys()]) if (match(k)) buffers.delete(k);
    plotted.value = plotted.value.filter(p => !match(p.key));
    version.value++;
  }

  /** Drops the recorded samples, the plotted selection stays. */
  function clear() {
    buffers.clear();
    version.value++;
  }

  return { version, plotted, record, get, keys, isPlotted, canPlotMore, togglePlotted, forget, clear };
});
