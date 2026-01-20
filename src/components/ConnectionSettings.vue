<template>
  <q-card bordered class="q-pa-md q-mb-md">
    <div class="text-h6">Connection Settings</div>
    
    <div class="q-gutter-sm row items-center q-my-sm">
      <q-radio v-model="store.connectionType" val="tcp" label="TCP" :disable="isConnected" />
      <q-radio v-model="store.connectionType" val="rtu" label="RTU" :disable="isConnected" />
    </div>

    <div v-if="store.connectionType === 'tcp'" class="row q-col-gutter-sm">
      <div class="col-8">
        <q-select
          v-model="store.tcpHost"
          label="Host"
          dense
          outlined
          use-input
          fill-input
          hide-selected
          input-debounce="0"
          :options="filterOptions"
          @filter="filterFn"
          @input-value="updateHost"
          :disable="isConnected"
        >
           <template v-slot:no-option>
            <q-item>
              <q-item-section class="text-grey">
                No history
              </q-item-section>
            </q-item>
          </template>
        </q-select>
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
    
    <div class="row items-center justify-between q-mt-sm">
      <div class="text-caption text-grey">
        <div>TX: <b class="text-black">{{ store.trafficStats.txMsg }}</b> msgs (<b class="text-black">{{ store.trafficStats.txBytes }}</b> B)</div>
        <div>RX: <b class="text-black">{{ store.trafficStats.rxMsg }}</b> msgs (<b class="text-black">{{ store.trafficStats.rxBytes }}</b> B)</div>
      </div>
      <div class="text-caption text-right">
        Status: <span :class="statusColor">{{ store.connectionStatus }}</span>
      </div>
    </div>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'ConnectionSettings',
  setup() {
    const store = useModbusStore();

    const isConnected = computed(() => store.connectionStatus === 'connected');
    
    // Autocomplete Logic
    const filterOptions = ref<string[]>([]);
    
    function filterFn (val: string, update: (fn: () => void) => void) {
      update(() => {
        const needle = val.toLowerCase();
        filterOptions.value = store.ipHistory.filter(v => v.toLowerCase().indexOf(needle) > -1);
      });
    }

    function updateHost(val: string) {
      store.tcpHost = val;
    }
    
    const statusColor = computed(() => {
      if (store.connectionStatus === 'connected') return 'text-positive text-bold';
      if (store.connectionStatus === 'error') return 'text-negative text-bold';
      return 'text-grey';
    });

    return { store, isConnected, statusColor, filterOptions, filterFn, updateHost };
  }
});
</script>
