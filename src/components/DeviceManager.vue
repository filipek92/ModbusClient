<template>
  <div class="q-ma-md">
    <q-card bordered class="q-pa-md q-mb-md">
      <div class="text-h6 q-mb-md">Device Management</div>
      
      <div class="row q-col-gutter-sm items-end">
        <div class="col-12 col-sm-4">
          <q-select
            v-model="selectedDecoder"
            :options="store.availableDecoders"
            option-value="id"
            option-label="name"
            label="Select Device Template"
            dense outlined
            emit-value
            map-options
          />
        </div>
        <div class="col-6 col-sm-2">
           <q-input v-model.number="slaveId" label="Slave ID" type="number" dense outlined />
        </div>
        <div class="col-6 col-sm-auto">
          <q-btn label="Add Device" color="primary" @click="addNewDevice" :disable="!selectedDecoder" />
        </div>
      </div>
    </q-card>

    <!-- Active Devices -->
    <div v-for="dev in store.devices" :key="dev.id" class="q-mb-md">
      <q-card bordered>
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="row items-center q-gutter-x-sm">
             <div class="text-h6">{{ dev.name }}</div>
             <div v-if="dev.lastUpdate" class="text-caption text-grey">Updated: {{ dev.lastUpdate }}</div>
          </div>
          <div>
            <q-chip v-if="dev.error" color="negative" text-color="white" icon="warning">{{ dev.error }}</q-chip>
             <q-btn 
              :icon="dev.enabled ? 'stop' : 'play_arrow'" 
              :color="dev.enabled ? 'red' : 'green'" 
              flat round 
              @click="store.toggleDevice(dev.id)" 
            >
              <q-tooltip>Start/Stop Polling</q-tooltip>
            </q-btn>
            <q-btn icon="info" color="blue" flat round @click="showInfo(dev.decoderId)">
              <q-tooltip>Register Info</q-tooltip>
            </q-btn>
            <q-btn icon="delete" color="grey" flat round @click="store.removeDevice(dev.id)">
              <q-tooltip>Remove Device</q-tooltip>
            </q-btn>
          </div>
        </q-card-section>
        
        <q-separator spaced />

        <q-card-section>
          <div class="row q-col-gutter-md">
             <!-- Fields -->
             <div 
                v-for="field in getFields(dev.decoderId)" 
                :key="field.name" 
                class="col-12 col-sm-6 col-md-4"
             >
               <q-card flat bordered class="q-pa-sm">
                 <div class="text-caption text-grey q-mb-xs">{{ field.name }} ({{ field.address }})</div>
                 
                 <!-- Editable Holding Register -->
                 <template v-if="field.type === 'holding' || field.type === 'coil'">
                    <!-- Enum Select -->
                    <template v-if="field.map">
                      <q-select
                        :model-value="dev.rawValues[field.name]"
                        @update:model-value="val => writeValue(dev.id, field.name, val)"
                        :options="Object.entries(field.map).map(([k, v]) => ({ label: `${k} (${v})`, value: Number(k) }))"
                        dense outlined
                        emit-value
                        map-options
                      />
                    </template>
                    <!-- Numeric Input -->
                    <template v-else>
                      <q-input 
                        :model-value="dev.rawValues[field.name]" 
                        @change="val => writeValue(dev.id, field.name, val)"
                        dense outlined 
                        type="number"
                        :suffix="field.unit"
                      />
                    </template>
                 </template>

                 <!-- Read-Only (Input/Discrete) -->
                 <template v-else>
                   <div class="text-h6 text-primary">
                      {{ dev.values[field.name] !== undefined ? dev.values[field.name] : '-' }}
                   </div>
                 </template>

               </q-card>
             </div>
          </div>
        </q-card-section>
      </q-card>
    </div>


    <!-- Info Dialog -->
    <q-dialog v-model="infoDialog">
      <q-card style="min-width: 600px; max-width: 80vw;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">{{ currentInfoDecoder?.name }} - Register Map</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="q-pa-none">
          <q-table
            flat
            :rows="currentInfoDecoder?.fields || []"
            :columns="infoColumns"
            row-key="address"
            :pagination="{ rowsPerPage: 0 }"
            dense
          >
             <template v-slot:body-cell-address="props">
                <q-td :props="props">
                  {{ props.row.address }} (0x{{ props.row.address.toString(16).toUpperCase().padStart(4, '0') }})
                </q-td>
             </template>
             <template v-slot:body-cell-map="props">
                <q-td :props="props">
                  <div v-if="props.row.map" style="max-width: 200px; white-space: pre-wrap; font-size: 0.8em">
                    {{ Object.entries(props.row.map).map(([k, v]) => `${k}=${v}`).join(', ') }}
                  </div>
                  <span v-else>-</span>
                </q-td>
             </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>

  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useModbusStore } from 'stores/modbus-store';
import { getDecoder } from 'src/decoders';
import type { DeviceDecoder } from 'src/decoders/types';

export default defineComponent({
  name: 'DeviceManager',
  setup() {
    const store = useModbusStore();
    const selectedDecoder = ref('');
    const slaveId = ref(1);

    // Info Dialog Logic
    const infoDialog = ref(false);
    const currentInfoDecoder = ref<DeviceDecoder | null>(null);

    const infoColumns = [
      { name: 'address', label: 'Address', field: 'address', sortable: true, align: 'left' },
      { name: 'name', label: 'Name', field: 'name', sortable: true, align: 'left' },
      { name: 'type', label: 'Type', field: 'type', sortable: true, align: 'left' },
      { name: 'dataType', label: 'Data Type', field: 'dataType', align: 'left' },
      { name: 'unit', label: 'Unit', field: 'unit', align: 'left' },
      { name: 'scale', label: 'Scale', field: 'scale', align: 'right' },
      { name: 'map', label: 'Map / Enum', field: 'map', align: 'left' },
    ];

    function showInfo(decoderId: string) {
       const d = getDecoder(decoderId);
       if (d) {
         currentInfoDecoder.value = d;
         infoDialog.value = true;
       }
    }

    function addNewDevice() {
      if (selectedDecoder.value) {
        store.addDevice(selectedDecoder.value, slaveId.value);
      }
    }

    function getFields(decoderId: string) {
       const d = getDecoder(decoderId);
       return d ? d.fields : [];
    }
    
    function writeValue(deviceId: string, fieldName: string, value: string | number) {
       store.writeDeviceValue(deviceId, fieldName, value);
    }

    return { 
      store, 
      selectedDecoder, 
      slaveId, 
      addNewDevice, 
      getFields, 
      writeValue, 
      Object,
      // Info Dialog
      infoDialog,
      currentInfoDecoder,
      infoColumns,
      showInfo
    };
  }
});
</script>
