<template>
  <div class="q-ma-md">
    <q-card bordered class="q-pa-md q-mb-md">
      <div class="row items-center q-mb-md">
        <div class="text-h6">Device Management</div>
        <q-space />
        <q-btn
          flat dense
          icon="add"
          label="Add Device"
          color="primary"
          @click="addDeviceDialog = true"
        />
        <q-btn 
          flat dense 
          icon="search" 
          label="Scan Bus" 
          color="secondary" 
          class="q-ml-sm"
          @click="scanDialog = true"
          :disable="store.connectionStatus !== 'connected'"
        >
          <q-tooltip v-if="store.connectionStatus !== 'connected'">
            Connect to scan
          </q-tooltip>
        </q-btn>
      </div>
    </q-card>

    <!-- Add Device Dialog -->
    <q-dialog v-model="addDeviceDialog" maximized transition-show="slide-up" transition-hide="slide-down" @before-show="blurActive">
      <q-card>
        <q-bar class="bg-primary text-white">
          <q-icon name="devices" />
          <div class="q-ml-sm">Device Templates</div>
          <q-space />
          <q-btn dense flat icon="close" @click="addDeviceDialog = false" />
        </q-bar>

        <q-card-section class="q-pb-none">
          <div class="row q-col-gutter-sm items-end">
            <div class="col">
              <q-input v-model="decoderFilter" dense outlined clearable placeholder="Filter by name or ID..." >
                <template v-slot:prepend><q-icon name="filter_list" /></template>
              </q-input>
            </div>
            <div class="col-auto">
              <q-btn flat icon="file_upload" label="Import JSON" color="accent" @click="handleImport" />
            </div>
            <div class="col-auto">
              <q-btn flat icon="cloud_download" label="Download Pack" color="info" @click="handleDownloadPack" :loading="isDownloading" />
            </div>
            <div class="col-auto">
              <q-btn flat icon="add_circle" label="New" color="positive" @click="openNewDecoder(); addDeviceDialog = false;" />
            </div>
          </div>
        </q-card-section>

        <q-card-section style="max-height: calc(100vh - 200px); overflow: auto;">
          <q-table
            flat bordered dense
            :rows="filteredDecoders"
            :columns="decoderListColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
            :selected="addSelectedRows"
            selection="single"
            @row-click="(_evt: Event, row: Record<string, unknown>) => { addSelectedDecoder = String(row.id); addSlaveId = Number(row.defaultSlaveId); }"
          >
            <template v-slot:body-cell-source="props">
              <q-td :props="props">
                <q-badge :color="props.row.isDefault ? 'blue-grey' : 'orange'" :label="props.row.isDefault ? 'Built-in' : 'User'" />
              </q-td>
            </template>
            <template v-slot:body-cell-fields="props">
              <q-td :props="props">
                {{ props.row.fields.length }} fields
                <q-tooltip>
                  <div v-for="f in props.row.fields.slice(0, 10)" :key="f.name" class="text-caption">
                    {{ f.address }} — {{ f.name }} ({{ f.type }}/{{ f.dataType }})
                  </div>
                  <div v-if="props.row.fields.length > 10" class="text-caption text-italic">...and {{ props.row.fields.length - 10 }} more</div>
                </q-tooltip>
              </q-td>
            </template>
            <template v-slot:body-cell-regTypes="props">
              <q-td :props="props">
                <span v-for="t in getUniqueRegTypes(props.row)" :key="t" class="q-mr-xs">
                  <q-badge outline :label="t" />
                </span>
              </q-td>
            </template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props">
                <q-btn flat round dense icon="edit" size="sm" color="orange" @click.stop="openEditDecoder(props.row.id); addDeviceDialog = false;">
                  <q-tooltip>Edit</q-tooltip>
                </q-btn>
                <q-btn flat round dense icon="file_download" size="sm" color="secondary" @click.stop="handleExport(props.row.id)">
                  <q-tooltip>Export</q-tooltip>
                </q-btn>
                <q-btn flat round dense icon="info" size="sm" color="blue" @click.stop="showInfo(props.row.id)">
                  <q-tooltip>Register Map</q-tooltip>
                </q-btn>
                <q-btn v-if="!props.row.isDefault" flat round dense icon="delete" size="sm" color="negative" @click.stop="handleDeleteDecoder(props.row.id)">
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-py-sm">
          <div class="row q-col-gutter-sm items-center">
            <div class="col-auto text-subtitle2">
              Selected: <strong>{{ addSelectedDecoderName || '(none)' }}</strong>
            </div>
            <div class="col-auto" style="width:120px">
              <q-input v-model.number="addSlaveId" label="Slave ID" type="number" dense outlined />
            </div>
            <div class="col-auto">
              <q-btn
                label="Add Device"
                icon="add"
                color="primary"
                :disable="!addSelectedDecoder"
                @click="confirmAddDevice"
              />
            </div>
            <q-space />
            <div class="col-auto text-caption text-grey">
              {{ store.availableDecoders.length }} templates available
            </div>
          </div>
        </q-card-section>

        <!-- Download Pack URL Dialog -->
        <q-dialog v-model="downloadUrlDialog" @before-show="blurActive">
          <q-card style="min-width: 450px">
            <q-card-section>
              <div class="text-h6">Download Decoder Pack</div>
              <div class="text-caption text-grey">Enter the URL to a .tar.gz archive containing decoder JSON files</div>
            </q-card-section>
            <q-card-section>
              <q-input
                v-model="downloadUrl"
                label="Pack URL (.tar.gz)"
                dense outlined
                placeholder="https://example.com/decoders.tar.gz"
              />
            </q-card-section>
            <q-card-actions align="right">
              <q-btn flat label="Cancel" v-close-popup />
              <q-btn label="Download" color="primary" icon="cloud_download" :loading="isDownloading" @click="executeDownloadPack" />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-card>
    </q-dialog>

    <!-- Scan Dialog -->
    <q-dialog v-model="scanDialog" @before-show="blurActive">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Scan Modbus Bus</div>
          <div class="text-caption">Scans ID range for active devices</div>
        </q-card-section>

        <q-card-section>
          <div class="row q-col-gutter-sm">
            <div class="col-4">
              <q-input v-model.number="scanStart" label="Start ID" type="number" dense outlined :disable="isScanning" />
            </div>
            <div class="col-4">
              <q-input v-model.number="scanEnd" label="End ID" type="number" dense outlined :disable="isScanning" />
            </div>
            <div class="col-4">
              <q-input v-model.number="scanTimeout" label="Timeout (ms)" type="number" dense outlined :disable="isScanning" />
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section style="max-height: 50vh" class="scroll">
          <div v-if="isScanning" class="row items-center justify-center q-pa-md">
            <q-spinner color="primary" size="2em" />
            <span class="q-ml-sm">Scanning ID: {{ currentScanId }}...</span>
          </div>
          
          <div v-if="!isScanning && scanHasRun && scanResults.length === 0" class="text-center text-grey q-pa-md">
             No devices found in range.
          </div>

          <q-list separator v-if="scanResults.length > 0">
             <q-item-label header>Found Devices</q-item-label>
             <q-item 
                v-for="id in scanResults" 
                :key="id" 
                clickable 
                v-ripple
                @click="useFoundID(id)"
             >
               <q-item-section avatar>
                 <q-icon name="check_circle" color="green" />
               </q-item-section>
               <q-item-section>
                 <q-item-label>Device ID: {{ id }}</q-item-label>
                 <q-item-label caption>Click to select this ID</q-item-label>
               </q-item-section>
             </q-item>
          </q-list>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn flat label="Close" color="primary" v-close-popup :disable="isScanning" />
          <q-btn label="Start Scan" color="secondary" @click="performScan" :loading="isScanning" />
        </q-card-actions>
      </q-card>
    </q-dialog>

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
                        @update:model-value="(val: string | number | null) => writeValue(dev.id, field.name, val ?? '')"
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
                        @change="(val: string | number | null) => writeValue(dev.id, field.name, val ?? '')"
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


    <!-- Edit Decoder Dialog -->
    <q-dialog v-model="editDialog" persistent maximized transition-show="slide-up" transition-hide="slide-down" @before-show="blurActive">
      <q-card>
        <q-bar class="bg-primary text-white">
          <div>{{ editIsNew ? 'New Decoder' : 'Edit Decoder' }}: {{ editDecoder.name || '(unnamed)' }}</div>
          <q-space />
          <q-btn dense flat icon="close" @click="editDialog = false" />
        </q-bar>

        <q-card-section class="q-pb-none">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-3">
              <q-input v-model="editDecoder.id" label="ID (unique slug)" dense outlined :rules="[(v: string) => !!v || 'Required']" />
            </div>
            <div class="col-12 col-sm-5">
              <q-input v-model="editDecoder.name" label="Device Name" dense outlined :rules="[(v: string) => !!v || 'Required']" />
            </div>
            <div class="col-12 col-sm-2">
              <q-input v-model.number="editDecoder.defaultSlaveId" label="Default Slave ID" type="number" dense outlined />
            </div>
            <div class="col-12 col-sm-2 flex items-center">
              <q-btn label="Add Field" icon="add" color="primary" dense @click="addEditField" class="full-width" />
            </div>
          </div>
        </q-card-section>

        <q-card-section class="q-pt-sm" style="max-height: calc(100vh - 170px); overflow: auto;">
          <q-table
            flat bordered dense
            :rows="editDecoder.fields"
            :columns="editFieldColumns"
            row-key="_idx"
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
          >
            <template v-slot:body="props">
              <q-tr :props="props">
                <q-td key="address" :props="props" style="width: 90px">
                  <q-input v-model.number="props.row.address" type="number" dense borderless input-style="text-align:center" />
                </q-td>
                <q-td key="name" :props="props" style="min-width: 140px">
                  <q-input v-model="props.row.name" dense borderless />
                </q-td>
                <q-td key="type" :props="props" style="width: 110px">
                  <q-select v-model="props.row.type" :options="registerTypeOptions" dense borderless emit-value map-options />
                </q-td>
                <q-td key="dataType" :props="props" style="width: 110px">
                  <q-select v-model="props.row.dataType" :options="dataTypeOptions" dense borderless emit-value map-options />
                </q-td>
                <q-td key="unit" :props="props" style="width: 70px">
                  <q-input v-model="props.row.unit" dense borderless />
                </q-td>
                <q-td key="scale" :props="props" style="width: 70px">
                  <q-input v-model.number="props.row.scale" type="number" step="any" dense borderless input-style="text-align:center" />
                </q-td>
                <q-td key="precision" :props="props" style="width: 60px">
                  <q-input v-model.number="props.row.precision" type="number" dense borderless input-style="text-align:center" />
                </q-td>
                <q-td key="wordOrder" :props="props" style="width: 120px">
                  <q-select v-model="props.row.wordOrder" :options="wordOrderOptions" dense borderless emit-value map-options clearable />
                </q-td>
                <q-td key="transform" :props="props" style="min-width: 160px">
                  <q-input v-model="props.row.transform" dense borderless placeholder="JS expression" />
                </q-td>
                <q-td key="map" :props="props" style="min-width: 140px">
                  <q-input v-model="props.row._mapString" dense borderless placeholder="0=Off,1=On" @update:model-value="(v: string | number | null) => parseMapString(props.row, v)" />
                </q-td>
                <q-td key="actions" :props="props" style="width: 80px">
                  <q-btn flat round dense icon="arrow_upward" size="sm" @click="moveField(props.rowIndex, -1)" :disable="props.rowIndex === 0" />
                  <q-btn flat round dense icon="arrow_downward" size="sm" @click="moveField(props.rowIndex, 1)" :disable="props.rowIndex === editDecoder.fields.length - 1" />
                  <q-btn flat round dense icon="delete" size="sm" color="negative" @click="removeEditField(props.rowIndex)" />
                </q-td>
              </q-tr>
            </template>
          </q-table>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey" @click="editDialog = false" />
          <q-btn
            v-if="!editIsNew && !editDecoderIsDefault"
            flat label="Delete Decoder" color="negative" icon="delete_forever"
            @click="confirmDeleteDecoder"
          />
          <q-btn label="Save" color="primary" icon="save" @click="handleSaveDecoder" :disable="!editDecoder.id || !editDecoder.name" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Info Dialog -->
    <q-dialog v-model="infoDialog" @before-show="blurActive">
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
import { defineComponent, ref, reactive, computed, onMounted } from 'vue';
import { useModbusStore } from 'stores/modbus-store';
import { getDecoder } from 'src/decoders';
import type { DeviceDecoder, DecoderField } from 'src/decoders/types';

export default defineComponent({
  name: 'DeviceManager',
  setup() {
    const store = useModbusStore();

    // Load decoders on mount
    onMounted(async () => {
      await store.loadDecoders();
    });

    // --- Add Device Dialog ---
    const addDeviceDialog = ref(false);
    const addSelectedDecoder = ref('');
    const addSlaveId = ref(1);
    const decoderFilter = ref('');

    type DecoderRow = DeviceDecoder & { isDefault?: boolean };

    const filteredDecoders = computed(() => {
      const q = decoderFilter.value.toLowerCase().trim();
      const list = store.availableDecoders as DecoderRow[];
      if (!q) return list;
      return list.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
    });

    const addSelectedRows = computed(() => {
      if (!addSelectedDecoder.value) return [];
      const found = store.availableDecoders.find((d: DeviceDecoder) => d.id === addSelectedDecoder.value);
      return found ? [found] : [];
    });

    const addSelectedDecoderName = computed(() => {
      if (!addSelectedDecoder.value) return '';
      const found = store.availableDecoders.find((d: DeviceDecoder) => d.id === addSelectedDecoder.value);
      return found ? found.name : '';
    });

    function getUniqueRegTypes(decoder: DeviceDecoder): string[] {
      const types = new Set(decoder.fields.map(f => f.type));
      return Array.from(types);
    }

    const decoderListColumns = [
      { name: 'name', label: 'Name', field: 'name', sortable: true, align: 'left' as const },
      { name: 'id', label: 'ID', field: 'id', sortable: true, align: 'left' as const },
      { name: 'source', label: 'Source', field: 'isDefault', sortable: true, align: 'center' as const },
      { name: 'defaultSlaveId', label: 'Default ID', field: 'defaultSlaveId', align: 'center' as const },
      { name: 'fields', label: 'Fields', field: 'fields', align: 'center' as const },
      { name: 'regTypes', label: 'Register Types', field: 'fields', align: 'left' as const },
      { name: 'actions', label: '', field: 'id', align: 'right' as const }
    ];

    function confirmAddDevice() {
      if (addSelectedDecoder.value) {
        store.addDevice(addSelectedDecoder.value, addSlaveId.value);
        addDeviceDialog.value = false;
      }
    }

    // Download Pack
    const downloadUrlDialog = ref(false);
    const downloadUrl = ref('https://github.com/example/modbus-decoders/releases/latest/download/decoders.tar.gz');
    const isDownloading = ref(false);

    function handleDownloadPack() {
      downloadUrlDialog.value = true;
    }

    async function executeDownloadPack() {
      isDownloading.value = true;
      try {
        const result = await store.downloadDecoderPack(downloadUrl.value || undefined);
        if (result.success && result.imported) {
          store.addLog(`Downloaded pack: ${result.imported.length} decoders imported`);
        } else if (result.error) {
          store.addLog(`Download failed: ${result.error}`);
        }
      } finally {
        isDownloading.value = false;
        downloadUrlDialog.value = false;
      }
    }

    async function handleImport() {
      const result = await store.importDecoder();
      if (result.success && result.imported && result.imported.length > 0) {
        store.addLog(`Imported: ${result.imported.join(', ')}`);
      }
    }

    async function handleExport(decoderId: string) {
      await store.exportDecoder(decoderId);
    }

    async function handleDeleteDecoder(decoderId: string) {
      await store.deleteDecoder(decoderId);
    }

    // --- Edit Decoder Logic ---
    const editDialog = ref(false);
    const editIsNew = ref(false);
    const editDecoderIsDefault = ref(false);

    interface EditField extends DecoderField {
      _idx: number;
      _mapString: string;
    }

    const editDecoder = reactive<{ id: string; name: string; defaultSlaveId: number; fields: EditField[] }>({
      id: '',
      name: '',
      defaultSlaveId: 1,
      fields: []
    });

    const registerTypeOptions = [
      { label: 'holding', value: 'holding' },
      { label: 'input', value: 'input' },
      { label: 'coil', value: 'coil' },
      { label: 'discrete', value: 'discrete' }
    ];
    const dataTypeOptions = [
      { label: 'uint16', value: 'uint16' },
      { label: 'int16', value: 'int16' },
      { label: 'uint32', value: 'uint32' },
      { label: 'int32', value: 'int32' },
      { label: 'float32', value: 'float32' },
      { label: 'boolean', value: 'boolean' }
    ];
    const wordOrderOptions = [
      { label: 'big-endian', value: 'big-endian' },
      { label: 'little-endian', value: 'little-endian' }
    ];

    const editFieldColumns = [
      { name: 'address', label: 'Address', field: 'address', align: 'center' as const },
      { name: 'name', label: 'Name', field: 'name', align: 'left' as const },
      { name: 'type', label: 'Reg Type', field: 'type', align: 'left' as const },
      { name: 'dataType', label: 'Data Type', field: 'dataType', align: 'left' as const },
      { name: 'unit', label: 'Unit', field: 'unit', align: 'left' as const },
      { name: 'scale', label: 'Scale', field: 'scale', align: 'center' as const },
      { name: 'precision', label: 'Prec', field: 'precision', align: 'center' as const },
      { name: 'wordOrder', label: 'Word Order', field: 'wordOrder', align: 'left' as const },
      { name: 'transform', label: 'Transform', field: 'transform', align: 'left' as const },
      { name: 'map', label: 'Map (k=v,...)', field: '_mapString', align: 'left' as const },
      { name: 'actions', label: '', field: '_idx', align: 'center' as const }
    ];

    function mapToString(m: Record<number | string, string> | undefined): string {
      if (!m) return '';
      return Object.entries(m).map(([k, v]) => `${k}=${v}`).join(',');
    }

    function parseMapString(row: EditField, val: string | number | null) {
      const s = String(val ?? '');
      if (!s.trim()) {
        row.map = undefined;
        return;
      }
      const result: Record<number, string> = {};
      s.split(',').forEach(pair => {
        const [k, ...rest] = pair.split('=');
        const key = k?.trim();
        const value = rest.join('=').trim();
        if (key !== '' && value !== '') {
          result[Number(key)] = value;
        }
      });
      row.map = Object.keys(result).length > 0 ? result : undefined;
    }

    function fieldToEdit(f: DecoderField, idx: number): EditField {
      return {
        ...f,
        _idx: idx,
        _mapString: mapToString(f.map)
      };
    }

    function openEditDecoder(decoderId: string) {
      const d = getDecoder(decoderId);
      if (!d) return;
      editIsNew.value = false;
      editDecoderIsDefault.value = !!d.isDefault;
      editDecoder.id = d.id;
      editDecoder.name = d.name;
      editDecoder.defaultSlaveId = d.defaultSlaveId;
      editDecoder.fields = d.fields.map((f, i) => fieldToEdit(f, i));
      editDialog.value = true;
    }

    function openNewDecoder() {
      editIsNew.value = true;
      editDecoderIsDefault.value = false;
      editDecoder.id = '';
      editDecoder.name = '';
      editDecoder.defaultSlaveId = 1;
      editDecoder.fields = [];
      editDialog.value = true;
    }

    function addEditField() {
      const lastAddr = editDecoder.fields.length > 0
        ? editDecoder.fields[editDecoder.fields.length - 1].address + 1
        : 0;
      editDecoder.fields.push({
        address: lastAddr,
        type: 'holding',
        name: '',
        dataType: 'uint16',
        unit: '',
        scale: 1,
        _idx: editDecoder.fields.length,
        _mapString: ''
      });
    }

    function removeEditField(index: number) {
      editDecoder.fields.splice(index, 1);
      editDecoder.fields.forEach((f, i) => f._idx = i);
    }

    function moveField(index: number, direction: -1 | 1) {
      const target = index + direction;
      if (target < 0 || target >= editDecoder.fields.length) return;
      const tmp = editDecoder.fields[index];
      editDecoder.fields[index] = editDecoder.fields[target];
      editDecoder.fields[target] = tmp;
      editDecoder.fields.forEach((f, i) => f._idx = i);
    }

    async function handleSaveDecoder() {
      // Strip internal fields and build clean decoder
      const decoder: DeviceDecoder = {
        id: editDecoder.id,
        name: editDecoder.name,
        defaultSlaveId: editDecoder.defaultSlaveId,
        fields: editDecoder.fields.map(f => {
          const clean: DecoderField = {
            address: f.address,
            type: f.type,
            name: f.name,
            dataType: f.dataType
          };
          if (f.unit) clean.unit = f.unit;
          if (f.scale !== undefined && f.scale !== null) clean.scale = f.scale;
          if (f.precision !== undefined && f.precision !== null) clean.precision = f.precision;
          if (f.wordOrder) clean.wordOrder = f.wordOrder;
          if (f.transform) clean.transform = f.transform;
          if (f.map && Object.keys(f.map).length > 0) clean.map = f.map;
          return clean;
        })
      };
      const result = await store.saveDecoder(decoder);
      if (result.success) {
        editDialog.value = false;
        addSelectedDecoder.value = decoder.id;
      }
    }

    async function confirmDeleteDecoder() {
      if (!editDecoder.id) return;
      const result = await store.deleteDecoder(editDecoder.id);
      if (result.success) {
        editDialog.value = false;
        if (addSelectedDecoder.value === editDecoder.id) {
          addSelectedDecoder.value = '';
        }
      }
    }

    // Scan Logic
    const scanDialog = ref(false);
    const scanStart = ref(1);
    const scanEnd = ref(20);
    const scanTimeout = ref(100);
    const isScanning = ref(false);
    const scanHasRun = ref(false);
    const scanResults = ref<number[]>([]);
    const currentScanId = ref<number | null>(null);

    async function performScan() {
       isScanning.value = true;
       scanHasRun.value = true;
       scanResults.value = [];
       currentScanId.value = null;

       // Listen for progress updates
       window.myAPI.onScanProgress((id) => {
         currentScanId.value = id;
       });

       try {
         const results = await window.myAPI.scanDevices(scanStart.value, scanEnd.value, scanTimeout.value);
         scanResults.value = results;
       } catch (e) {
         console.error(e);
       } finally {
         isScanning.value = false;
         currentScanId.value = null;
       }
    }

    function useFoundID(id: number) {
       addSlaveId.value = id;
       scanDialog.value = false;
    }

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

    function getFields(decoderId: string) {
       const d = getDecoder(decoderId);
       return d ? d.fields : [];
    }
    
    function writeValue(deviceId: string, fieldName: string, value: string | number) {
       store.writeDeviceValue(deviceId, fieldName, value);
    }

    function blurActive() {
      (document.activeElement as HTMLElement | null)?.blur();
    }

    return { 
      store, 
      getFields, 
      writeValue, 
      Object,
      // Add Device Dialog
      addDeviceDialog,
      addSelectedDecoder,
      addSlaveId,
      decoderFilter,
      filteredDecoders,
      addSelectedRows,
      addSelectedDecoderName,
      decoderListColumns,
      getUniqueRegTypes,
      confirmAddDevice,
      // Download Pack
      downloadUrlDialog,
      downloadUrl,
      isDownloading,
      handleDownloadPack,
      executeDownloadPack,
      // Import/Export
      handleImport,
      handleExport,
      handleDeleteDecoder,
      // Edit Decoder
      editDialog,
      editIsNew,
      editDecoderIsDefault,
      editDecoder,
      editFieldColumns,
      registerTypeOptions,
      dataTypeOptions,
      wordOrderOptions,
      openEditDecoder,
      openNewDecoder,
      addEditField,
      removeEditField,
      moveField,
      parseMapString,
      handleSaveDecoder,
      confirmDeleteDecoder,
      // Info Dialog
      infoDialog,
      currentInfoDecoder,
      infoColumns,
      showInfo,
      // Scan Dialog
      scanDialog,
      scanStart,
      scanEnd,
      scanTimeout,
      isScanning,
      scanHasRun,
      scanResults,
      currentScanId,
      performScan,
      useFoundID,
      blurActive
    };
  }
});
</script>
