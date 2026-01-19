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
        <RegularCollectors />
      </div>
    </div>

    <!-- Bottom -->
    <div class="q-mt-md">
      <LogConsole />
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConnectionSettings from 'components/ConnectionSettings.vue';
import ManualQuery from 'components/ManualQuery.vue';
import RegularCollectors from 'components/RegularCollectors.vue';
import LogConsole from 'components/LogConsole.vue';

export default defineComponent({
  name: 'IndexPage',
  components: {
    ConnectionSettings,
    ManualQuery,
    RegularCollectors,
    LogConsole
  }
});
</script>
