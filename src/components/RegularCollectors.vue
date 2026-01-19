<template>
  <q-card bordered class="q-pa-md q-mb-md">
    <div class="row items-center justify-between">
      <div class="text-h6">Regular Collectors</div>
      <q-btn icon="add" round color="primary" size="sm" @click="store.addCollector" />
    </div>

    <q-list separator class="q-mt-sm">
      <q-expansion-item 
        v-for="col in store.collectors" 
        :key="col.id" 
        group="collectors"
        class="border-radius-inherit" 
        header-class="bg-grey-2"
        expand-separator
      >
        <template v-slot:header>
          <q-item-section avatar>
            <q-toggle 
              :model-value="col.enabled" 
              @update:model-value="() => store.toggleCollector(col.id)"
              dense 
              :disable="!isConnected"
              @click.stop
            />
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-bold">{{ col.name || 'Unnamed' }}</q-item-label>
            <q-item-label caption>
              ID: {{col.slaveId}}, Addr: {{col.startAddress}}
            </q-item-label>
          </q-item-section>

          <q-item-section side>
             <div v-if="col.error" class="text-negative text-bold">Error</div>
             <pre v-else class="text-primary text-bold text-h6 q-ma-none" style="font-family: monospace; white-space: pre-wrap; text-align: right;">{{ col.lastValue }}</pre>
          </q-item-section>
        </template>

        <q-card>
          <q-card-section>
             <div class="row q-col-gutter-sm">
               <div class="col-12 col-sm-4">
                 <q-select 
                    v-model="col.type" 
                    :options="typeOptions" 
                    label="Register Type" 
                    dense 
                    outlined 
                    emit-value 
                    map-options 
                 />
               </div>
               <div class="col-12 col-sm-8">
                 <q-input v-model="col.name" dense outlined label="Name" />
               </div>

               <div class="col-6 col-sm-3">
                 <q-input v-model.number="col.slaveId" type="number" dense outlined label="Slave ID" />
               </div>
               <div class="col-6 col-sm-3">
                 <q-input v-model.number="col.startAddress" type="number" dense outlined label="Start Addr" />
               </div>
               <div class="col-6 col-sm-3">
                 <q-input v-model.number="col.length" type="number" dense outlined label="Length" />
               </div>
               <div class="col-6 col-sm-3">
                 <q-input v-model.number="col.interval" type="number" dense outlined label="Interval (ms)" />
               </div>

               <div class="col-12">
                <q-input 
                  v-model="col.jsConversion" 
                  dense 
                  outlined 
                  type="textarea" 
                  autogrow
                  label="JS Conversion (value = reg[])" 
                  hint="e.g. return value[0] / 10"
                  input-style="font-family: monospace"
                >
                  <template v-slot:prepend>
                    <div class="self-start q-mt-sm text-caption">fn(value) {</div>
                  </template>
                  <template v-slot:append>
                    <div class="self-end q-mb-sm text-caption">}</div>
                  </template>
                </q-input>
              </div>
             </div>

            <div class="row justify-between items-center q-mt-md">
              <q-btn icon="delete" label="Delete Collector" flat color="negative" @click="store.removeCollector(col.id)" />
              
              <!-- Detailed Result -->
               <div class="text-right" style="max-width: 50%;">
                  <div class="text-caption text-grey-7">Result:</div>
                  <div v-if="col.error" class="text-negative text-bold">{{ col.error }}</div>
                  <pre v-else class="q-ma-none text-primary" style="white-space: pre-wrap; font-family: monospace;">{{ col.lastValue }}</pre>
               </div>
            </div>

          </q-card-section>
        </q-card>
      </q-expansion-item>

      <div v-if="store.collectors.length === 0" class="text-center text-grey q-pa-sm">
        No collectors added.
      </div>
    </q-list>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useModbusStore } from 'stores/modbus-store';

export default defineComponent({
  name: 'RegularCollectors',
  setup() {
    const store = useModbusStore();
    const isConnected = computed(() => store.connectionStatus === 'connected');
    
    const typeOptions = [
      { label: 'Holding (FC03)', value: 'holding' },
      { label: 'Input (FC04)', value: 'input' },
      { label: 'Coil (FC01)', value: 'coil' },
      { label: 'Discrete (FC02)', value: 'discrete' }
    ];

    return { store, isConnected, typeOptions };
  }
});
</script>
