<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-avatar>
          <img src="~assets/app-icon.svg" />
        </q-avatar>
        <q-toolbar-title> Modbus Client </q-toolbar-title>
        <div class="text-caption q-mr-md">v{{ version }}</div>
        <q-btn
          flat dense round
          icon="menu_book"
          @click="docsOpen = true"
        >
          <q-tooltip>Dokumentace</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Documentation modal -->
    <q-dialog v-model="docsOpen" :maximized="false" @before-show="blurActive">
      <q-card style="width: 900px; max-width: 92vw; height: 85vh; display: flex; flex-direction: column;">
        <q-bar class="bg-primary text-white">
          <q-icon name="menu_book" />
          <div class="q-ml-sm">Dokumentace</div>
          <q-space />
          <q-btn dense flat icon="close" @click="docsOpen = false" />
        </q-bar>
        <Documentation style="flex: 1; overflow: hidden;" />
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useModbusStore } from 'stores/modbus-store';
import packageInfo from '../../package.json';
import Documentation from 'components/Documentation.vue';

defineOptions({
  name: 'MainLayout',
});

const store = useModbusStore();
const version = ref(packageInfo.version);
const docsOpen = ref(false);

function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur();
}

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