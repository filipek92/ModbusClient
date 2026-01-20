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
          <div class="text-h6">{{ dev.name }}</div>
          <div>
            <q-chip v-if="dev.error" color="negative" text-color="white" icon="warning">{{ dev.error }}</q-chip>
             <q-btn 
              :icon="dev.enabled ? 'stop' : 'play_arrow'" 
              :color="dev.enabled ? 'red' : 'green'" 
              flat round 
              @click="store.toggleDevice(dev.id)" 
            />
            <q-btn icon="delete" color="grey" flat round @click="store.removeDevice(dev.id)" />
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
                      >
                         <template v-slot:after>
                            <q-btn round flat dense icon="save" size="sm" color="primary" @click="writeValue(dev.id, field.name, dev.rawValues[field.name])" />
                         </template>
                      </q-input>
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

  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useModbusStore } from 'stores/modbus-store';
import { getDecoder } from 'src/decoders';

export default defineComponent({
  name: 'DeviceManager',
  setup() {
    const store = useModbusStore();
    const selectedDecoder = ref('');
    const slaveId = ref(1);

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

    return { store, selectedDecoder, slaveId, addNewDevice, getFields, writeValue, Object };
  }
});
</script>
