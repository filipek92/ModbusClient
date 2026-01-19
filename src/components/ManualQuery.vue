<template>
  <q-card bordered class="q-pa-md q-mb-md">
    <div class="row justify-between items-center q-mb-md">
      <div class="text-h6">Manual Operation</div>
      <q-btn-toggle
        v-model="store.manualWriteMode"
        toggle-color="primary"
        :options="[
          {label: 'Read', value: 'read'},
          {label: 'Write', value: 'write'}
        ]"
        dense
        flat
      />
    </div>
    
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-sm-3">
         <q-select
          v-model="store.manualType"
          :options="typeOptions"
          label="Register Type"
          dense
          outlined
          emit-value
          map-options
        />
      </div>

      <div class="col-6 col-sm-2">
        <q-input v-model.number="store.manualSlaveId" label="Slave ID" type="number" dense outlined />
      </div>
      <div class="col-6 col-sm-2">
        <q-input v-model.number="store.manualStart" label="Start Addr" type="number" dense outlined />
      </div>
      
      <!-- Read Mode: Length -->
      <div v-if="store.manualWriteMode === 'read'" class="col-6 col-sm-2">
        <q-input v-model.number="store.manualLength" label="Length" type="number" dense outlined />
      </div>
      
      <!-- Write Mode: Value(s) -->
       <div v-else class="col-12 col-sm-3">
        <q-input v-model="store.manualWriteValue" label="Values (comma sep)" dense outlined hint="e.g. 10, 20 or 1, 0, true" />
      </div>

      <div class="col-12 col-sm-auto flex flex-center">
        <q-btn 
          v-if="store.manualWriteMode === 'read'"
          label="Read" 
          color="secondary" 
          @click="store.manualRead" 
          :disable="!isConnected" 
          class="full-width"
        />
        <q-btn 
          v-else
          label="Write" 
          color="accent" 
          @click="store.manualWrite" 
          :disable="!isConnected" 
          class="full-width"
        />
      </div>
    </div>

    <div class="q-mt-sm bg-grey-2 q-pa-sm rounded-borders" style="min-height: 40px;">
      <div class="row justify-between">
        <div>Result:</div>
        <div v-if="store.manualTimestamp" class="text-caption text-grey-7">{{ store.manualTimestamp }}</div>
      </div>
      
      <div v-if="store.manualData && store.manualData.length > 0">
        <q-markup-table dense flat bordered class="bg-white q-mt-xs">
          <thead>
            <tr>
              <th class="text-left">Register</th>
              <th class="text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in resultRows" :key="row.regDec">
              <td class="text-left">{{ row.regDec }} ({{ row.regHex }})</td>
              <td class="text-left">{{ row.valDec }} <span v-if="row.valHex">({{ row.valHex }})</span></td>
            </tr>
          </tbody>
        </q-markup-table>
      </div>
      <pre v-else class="q-ma-none" style="white-space: pre-wrap;">{{ store.manualResult }}</pre>
    </div>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'ManualQuery',
  setup() {
    const store = useModbusStore();
    const isConnected = computed(() => store.connectionStatus === 'connected');

    const typeOptions = computed(() => {
      // For write mode, restricted options are handled by validation but UI can also help
      if (store.manualWriteMode === 'write') {
        return [
          { label: 'Holding (FC03/06/16)', value: 'holding' },
          { label: 'Coil (FC01/05/15)', value: 'coil' }
        ];
      }
      return [
        { label: 'Holding (FC03)', value: 'holding' },
        { label: 'Input (FC04)', value: 'input' },
        { label: 'Coil (FC01)', value: 'coil' },
        { label: 'Discrete (FC02)', value: 'discrete' }
      ];
    });

    const resultRows = computed(() => {
      if (!store.manualData) return [];
      return store.manualData.map((val, idx) => {
        const addr = store.manualReadStart + idx;
        let valNum: number;
        
        if (typeof val === 'boolean') {
          valNum = val ? 1 : 0;
        } else {
          valNum = val as number;
        }

        return {
          regDec: addr,
          regHex: `0x${addr.toString(16).toUpperCase()}`,
          valDec: valNum,
          valHex: `0x${valNum.toString(16).toUpperCase()}`
        };
      });
    });

    return { store, isConnected, typeOptions, resultRows };
  }
});
</script>
