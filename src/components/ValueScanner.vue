<template>
  <q-card class="full-width">
    <q-card-section>
      <div class="text-h6">Value Scanner</div>
      <div class="text-caption text-grey">Scan registers for a specific known value (e.g., finding where the temperature 25.0 (250) is stored).</div>
    </q-card-section>

    <q-card-section>
      <div class="row q-col-gutter-sm items-center">
        <!-- Target Value -->
        <div class="col-12 col-sm-3">
          <q-input
            v-model.number="targetValue"
            label="Target Value (Data)"
            type="number"
            outlined
            dense
            hint="Integer (e.g. 235)"
          />
        </div>

        <!-- Start Address -->
        <div class="col-12 col-sm-3">
          <q-input
            v-model.number="startAddress"
            label="Start Address"
            type="number"
            outlined
            dense
          />
        </div>

        <!-- Count -->
        <div class="col-12 col-sm-3">
          <q-input
            v-model.number="count"
            label="Count / Range"
            type="number"
            outlined
            dense
            hint="How many registers to scan"
          />
        </div>

        <!-- Scan Button -->
        <div class="col-12 col-sm-3 text-right">
           <q-btn
            color="primary"
            label="Scan"
            icon="search"
            :loading="scanning"
            @click="startScan"
          />
        </div>
      </div>

      <div class="row q-mt-sm">
        <div class="col-12">
          <div class="text-subtitle2">Register Types to Scan:</div>
          <q-checkbox v-model="scanHolding" label="Holding Registers (4xxxx)" />
          <q-checkbox v-model="scanInput" label="Input Registers (3xxxx)" />
        </div>
      </div>
      
      <!-- Progress Bar -->
      <div v-if="scanning" class="row q-mt-md">
        <div class="col-12">
          <q-linear-progress :value="progress" color="primary" size="10px" stripe rounded track-color="grey-3">
             <div class="absolute-full flex flex-center">
                <q-badge color="white" text-color="primary" :label="Math.round(progress * 100) + '%'" />
             </div>
          </q-linear-progress>
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <!-- Results -->
    <q-card-section v-if="results.length > 0 || hasScanned">
      <div class="text-subtitle2 q-mb-xs">
        Results <span v-if="scanning" class="text-grey">(Scanning...)</span>
      </div>
      
      <div v-if="results.length === 0 && !scanning" class="text-grey italic">
        No matches found for value {{ targetValue }}.
      </div>

      <q-markup-table v-else dense flat bordered separator="cell">
        <thead>
          <tr>
            <th class="text-left">Type</th>
            <th class="text-right">Address</th>
            <th class="text-right">Value</th>
            <th class="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(res, idx) in results" :key="idx">
            <td class="text-left">
              <q-badge :color="res.type === 'holding' ? 'blue' : 'orange'">
                {{ res.type.toUpperCase() }}
              </q-badge>
            </td>
            <td class="text-right">{{ res.address }}</td>
            <td class="text-right">{{ res.value }}</td>
            <td class="text-right">
              <q-btn size="sm" flat round icon="content_copy" @click="copyToClipboard(res.address.toString())">
                <q-tooltip>Copy Address</q-tooltip>
              </q-btn>
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useQuasar } from 'quasar';

interface ScanResult {
  address: number;
  type: 'holding' | 'input';
  value: number;
}

export default defineComponent({
  name: 'ValueScanner',
  setup() {
    const $q = useQuasar();
    
    // Inputs
    const targetValue = ref<number>(0);
    const startAddress = ref<number>(0);
    const count = ref<number>(100);
    const scanHolding = ref<boolean>(true);
    const scanInput = ref<boolean>(true);

    // State
    const scanning = ref(false);
    const hasScanned = ref(false);
    const results = ref<ScanResult[]>([]);
    const progress = ref(0);

    // Listen to progress
    window.myAPI.onValueScanProgress((p: number) => {
      progress.value = p / 100.0;
    });

    const startScan = async () => {
      if (!scanHolding.value && !scanInput.value) {
        $q.notify({ type: 'warning', message: 'Select at least one register type.' });
        return;
      }
      
      scanning.value = true;
      hasScanned.value = false;
      results.value = [];
      progress.value = 0;

      try {
        const types: ('holding' | 'input')[] = [];
        if (scanHolding.value) types.push('holding');
        if (scanInput.value) types.push('input');

        // We assume the backend takes care of the scanning logic
        // The exposed API call in preload: scanValues(startAddr, count, value, types)
        const matches = await window.myAPI.scanValues(
          startAddress.value,
          count.value,
          targetValue.value,
          types
        );

        results.value = matches;
        hasScanned.value = true;
        
        if (matches.length > 0) {
            $q.notify({ type: 'positive', message: `Found ${matches.length} matches!` });
        } else {
            $q.notify({ type: 'info', message: 'No matches found.' });
        }

      } catch (e) {
        console.error(e);
        $q.notify({ type: 'negative', message: 'Scan failed: ' + (e instanceof Error ? e.message : String(e)) });
      } finally {
        scanning.value = false;
      }
    };

    const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      $q.notify({ type: 'positive', message: 'Copied to clipboard', timeout: 1000 });
    };

    return {
      targetValue,
      startAddress,
      count,
      scanHolding,
      scanInput,
      scanning,
      hasScanned,
      results,
      progress,
      startScan,
      copyToClipboard
    };
  }
});
</script>