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
            <!-- Render fields -->
             <!-- We need to access the decoder definition to know the order and units, or just iterate values if simple -->
             <!-- Better: Iterate the decoder fields from definition -->
             <div 
                v-for="field in getFields(dev.decoderId)" 
                :key="field.name" 
                class="col-6 col-sm-3 col-md-2"
             >
               <q-card flat bordered class="text-center q-pa-sm">
                 <div class="text-caption text-grey">{{ field.name }}</div>
                 <div class="text-h6 text-primary">
                    {{ dev.values[field.name] !== undefined ? dev.values[field.name] : '-' }}
                 </div>
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

    return { store, selectedDecoder, slaveId, addNewDevice, getFields };
  }
});
</script>
