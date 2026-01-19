<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- Left Column -->
      <div class="col-12 col-md-5">
        <ConnectionSettings />
        <ManualQuery />
      </div>

      <!-- Right Column -->
      <div class="col-12 col-md-7">
        <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="justify" narrow-indicator>
          <q-tab name="collectors" label="Collectors" />
          <q-tab name="devices" label="Devices" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="collectors" class="q-pa-none q-pt-sm">
             <RegularCollectors />
          </q-tab-panel>

          <q-tab-panel name="devices" class="q-pa-none q-pt-sm">
             <DeviceManager />
          </q-tab-panel>
        </q-tab-panels>
      </div>
    </div>

    <!-- Bottom -->
    <div class="q-mt-md">
      <LogConsole />
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import ConnectionSettings from 'components/ConnectionSettings.vue';
import ManualQuery from 'components/ManualQuery.vue';
import RegularCollectors from 'components/RegularCollectors.vue';
import DeviceManager from 'components/DeviceManager.vue';
import LogConsole from 'components/LogConsole.vue';

export default defineComponent({
  name: 'IndexPage',
  components: {
    ConnectionSettings,
    ManualQuery,
    RegularCollectors,
    DeviceManager,
    LogConsole
  },
  setup() {
    const tab = ref('devices');
    return { tab };
  }
});
</script>
