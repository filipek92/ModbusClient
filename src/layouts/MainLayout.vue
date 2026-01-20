<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-avatar>
          <img src="~assets/app-icon.svg" />
        </q-avatar>
        <q-toolbar-title> Modbus Client </q-toolbar-title>
        <div>v{{ version }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useModbusStore } from 'stores/modbus-store';
import packageInfo from '../../package.json';

defineOptions({
  name: 'MainLayout',
});

const store = useModbusStore();
const version = ref(packageInfo.version);

onMounted(() => {
  try {
    window.myAPI.onLog((msg: string) => {
      store.addLog(msg);
    });
    window.myAPI.onStatusChange((status: string) => {
      store.setStatus(status);
    });

    window.myAPI.onTrafficStats((stats) => {
      store.trafficStats = stats;
    });
  } catch (error) {
    console.error('Failed to initialize window event listeners:', error);
  }
});
</script>