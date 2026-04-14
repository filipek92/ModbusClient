<template>
  <router-view />
</template>

<script lang="ts">
import { defineComponent, onMounted } from 'vue';
import { useQuasar } from 'quasar';

export default defineComponent({
  name: 'App',
  setup() {
    const $q = useQuasar();

    onMounted(() => {
      if (window.myAPI) {
        window.myAPI.onUpdateAvailable((info) => {
          $q.notify({
            message: `Nová verze ${info.version} je k dispozici.`,
            color: 'primary',
            icon: 'cloud_download',
            actions: [
              { 
                label: 'Stáhnout', 
                color: 'white', 
                handler: () => {
                  window.myAPI.downloadUpdate();
                  $q.notify({ message: 'Stahování aktualizace...', color: 'info' });
                } 
              },
              { label: 'Zavřít', color: 'white' }
            ],
            timeout: 0
          });
        });

        window.myAPI.onUpdateDownloaded((info) => {
          $q.notify({
            message: `Aktualizace ${info.version} byla stažena a je připravena k instalaci.`,
            color: 'positive',
            icon: 'check_circle',
            actions: [
              { 
                label: 'Instalovat a restartovat', 
                color: 'white', 
                handler: () => {
                  window.myAPI.installUpdate();
                } 
              }
            ],
            timeout: 0
          });
        });

        window.myAPI.onUpdateError((err) => {
          console.error('Update error:', err);
          $q.notify({
            message: `Chyba při aktualizaci: ${err}`,
            color: 'negative',
            icon: 'error'
          });
        });
      }
    });
  }
});
</script>
