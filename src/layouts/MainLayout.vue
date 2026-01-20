<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-avatar>
          <img src="~assets/app-icon.svg" />
        </q-avatar>
        <q-toolbar-title>
          Modbus Client
        </q-toolbar-title>
        <div>Quasar v{{ $q.version }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent, onMounted } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'MainLayout',
  setup() {
    const store = useModbusStore();

    onMounted(() => {
      window.myAPI.onLog((msg: string) => {
        store.addLog(msg);
      });
      window.myAPI.onStatusChange((status: string) => {
        store.setStatus(status);
      });

      window.myAPI.onTrafficStats((stats) => {
         store.trafficStats = stats;
      });
    });

    return {};
  }
});
</script>
