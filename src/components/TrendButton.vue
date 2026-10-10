<template>
  <q-btn
    icon="show_chart"
    :color="plotted ? 'primary' : 'grey-5'"
    flat round dense
    :size="size"
    :disable="!plotted && !trend.canPlotMore()"
    @click.stop="trend.togglePlotted(seriesKey)"
  >
    <q-tooltip>{{ plotted ? 'Remove from chart' : 'Show in chart' }}</q-tooltip>
  </q-btn>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useTrendStore } from 'stores/trend-store';

/** Toggles a value (series key from trend-store) in the trend chart. */
export default defineComponent({
  name: 'TrendButton',
  props: {
    seriesKey: { type: String, required: true },
    size: { type: String, default: 'sm' },
  },
  setup(props) {
    const trend = useTrendStore();
    const plotted = computed(() => trend.isPlotted(props.seriesKey));
    return { trend, plotted };
  }
});
</script>
