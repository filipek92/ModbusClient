<template>
  <q-card bordered class="q-pa-md q-mb-md">
    <div class="text-h6">Connection Settings</div>
    
    <div class="q-gutter-sm row items-center q-my-sm">
      <q-radio v-model="store.connectionType" val="tcp" label="TCP" :disable="isConnected" />
      <q-radio v-model="store.connectionType" val="rtu" label="RTU" :disable="isConnected" />
    </div>

    <div v-if="store.connectionType === 'tcp'" class="row q-col-gutter-sm">
      <div class="col-8">
        <q-input v-model="store.tcpHost" label="Host" dense outlined :disable="isConnected" />
      </div>
      <div class="col-4">
        <q-input v-model.number="store.tcpPort" label="Port" type="number" dense outlined :disable="isConnected" />
      </div>
    </div>

    <div v-else class="row q-col-gutter-sm">
      <div class="col-6">
        <q-input v-model="store.rtuPath" label="Path" dense outlined :disable="isConnected" />
      </div>
      <div class="col-3">
        <q-input v-model.number="store.rtuBaudRate" label="Baud Rate" type="number" dense outlined :disable="isConnected" />
      </div>
      <div class="col-3">
        <q-select v-model="store.rtuParity" :options="['none','even','odd','mark','space']" label="Parity" dense outlined :disable="isConnected" />
      </div>
      <div class="col-3">
        <q-input v-model.number="store.rtuDataBits" label="Data Bits" type="number" dense outlined :disable="isConnected" />
      </div>
      <div class="col-3">
        <q-input v-model.number="store.rtuStopBits" label="Stop Bits" type="number" dense outlined :disable="isConnected" />
      </div>
    </div>

    <div class="q-mt-md flex justify-end">
      <q-btn 
        v-if="!isConnected"
        label="Connect" 
        color="primary" 
        @click="store.connect" 
        :loading="store.connectionStatus === 'connecting'"
      />
      <q-btn 
        v-else
        label="Disconnect" 
        color="negative" 
        @click="store.disconnect" 
      />
    </div>
    
    <div class="text-caption q-mt-sm text-right">
      Status: <span :class="statusColor">{{ store.connectionStatus }}</span>
    </div>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'ConnectionSettings',
  setup() {
    const store = useModbusStore();

    const isConnected = computed(() => store.connectionStatus === 'connected');
    
    const statusColor = computed(() => {
      if (store.connectionStatus === 'connected') return 'text-positive text-bold';
      if (store.connectionStatus === 'error') return 'text-negative text-bold';
      return 'text-grey';
    });

    return { store, isConnected, statusColor };
  }
});
</script>
