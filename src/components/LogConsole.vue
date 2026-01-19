<template>
  <q-card bordered class="q-pa-none column" style="height: 200px">
    <div class="q-pa-xs bg-grey-3 text-caption text-bold border-bottom">
      Log Console
    </div>
    <q-scroll-area class="col q-pa-xs font-mono" style="font-family: monospace; font-size: 12px;">
      <div v-for="log in logs" :key="log.id">
        {{ log.message }}
      </div>
    </q-scroll-area>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'LogConsole',
  setup() {
    const store = useModbusStore();
    // Reverse logs to show newest at bottom? 
    // Usually console logs append to bottom.
    // We will just display them in order. 
    // And auto-scroll would be nice but simple binding is requested.
    return { logs: computed(() => store.logs) };
  }
});
</script>
