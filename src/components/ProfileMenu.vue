<template>
  <q-btn-dropdown flat dense no-caps icon="folder_special" :label="label" class="q-mr-sm">
    <q-list dense style="min-width: 260px">
      <q-item-label header>Profiles</q-item-label>

      <q-item
        v-for="p in profiles.profiles"
        :key="p.id"
        clickable
        v-close-popup
        :active="p.id === profiles.activeProfileId"
        @click="load(p.id)"
      >
        <q-item-section>
          <q-item-label>{{ p.name }}</q-item-label>
          <q-item-label caption>
            {{ p.workspace.devices.length }} devices, {{ p.workspace.collectors.length }} collectors
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row no-wrap">
            <q-btn flat round dense size="sm" icon="edit" @click.stop="rename(p.id)">
              <q-tooltip>Rename</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="file_download" @click.stop="exportProfile(p.id)">
              <q-tooltip>Export to file</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="delete" color="negative" @click.stop="remove(p.id)">
              <q-tooltip>Delete</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>

      <q-item v-if="profiles.profiles.length === 0">
        <q-item-section class="text-grey">No saved profiles</q-item-section>
      </q-item>

      <q-separator />

      <q-item clickable v-close-popup :disable="!profiles.activeProfile || !profiles.isModified" @click="profiles.saveActiveProfile">
        <q-item-section avatar><q-icon name="save" /></q-item-section>
        <q-item-section>Save{{ profiles.activeProfile ? ` "${profiles.activeProfile.name}"` : '' }}</q-item-section>
      </q-item>
      <q-item clickable v-close-popup @click="saveAs">
        <q-item-section avatar><q-icon name="save_as" /></q-item-section>
        <q-item-section>Save as new profile…</q-item-section>
      </q-item>
      <q-item clickable v-close-popup @click="importProfile">
        <q-item-section avatar><q-icon name="file_upload" /></q-item-section>
        <q-item-section>Import from file…</q-item-section>
      </q-item>
      <q-item clickable v-close-popup @click="newWorkspace">
        <q-item-section avatar><q-icon name="note_add" /></q-item-section>
        <q-item-section>New empty workspace</q-item-section>
      </q-item>
    </q-list>
  </q-btn-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { useModbusStore } from 'stores/modbus-store';
import { useProfileStore } from 'stores/profile-store';

defineOptions({
  name: 'ProfileMenu',
});

const $q = useQuasar();
const modbus = useModbusStore();
const profiles = useProfileStore();

const label = computed(() => {
  const p = profiles.activeProfile;
  if (!p) return 'No profile';
  return profiles.isModified ? `${p.name} *` : p.name;
});

function confirm(title: string, message: string, ok = 'OK'): Promise<boolean> {
  return new Promise(resolve => {
    $q.dialog({ title, message, cancel: true, persistent: true, ok })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
}

function promptName(title: string, model: string): Promise<string | null> {
  return new Promise(resolve => {
    $q.dialog({
      title,
      prompt: { model, type: 'text', isValid: (v: string) => v.trim().length > 0 },
      cancel: true,
      persistent: true,
    })
      .onOk((v: string) => resolve(v.trim()))
      .onCancel(() => resolve(null));
  });
}

/** Asks before an action that would discard the current workspace. */
async function confirmReplace(action: string): Promise<boolean> {
  const warnings: string[] = [];
  if (profiles.isModified) warnings.push(`Unsaved changes in "${profiles.activeProfile?.name}" will be lost.`);
  if (modbus.connectionStatus === 'connected') warnings.push('The current connection will be closed.');
  if (!warnings.length) return true;
  return confirm(action, warnings.join(' '), 'Continue');
}

async function load(id: string) {
  if (id === profiles.activeProfileId && !profiles.isModified) return;
  if (!await confirmReplace('Load profile')) return;
  await profiles.loadProfile(id);
}

async function saveAs() {
  const name = await promptName('Save as new profile', profiles.activeProfile?.name ?? '');
  if (name) profiles.saveProfileAs(name);
}

async function rename(id: string) {
  const p = profiles.profiles.find(x => x.id === id);
  if (!p) return;
  const name = await promptName('Rename profile', p.name);
  if (name) profiles.renameProfile(id, name);
}

async function remove(id: string) {
  const p = profiles.profiles.find(x => x.id === id);
  if (!p) return;
  if (await confirm('Delete profile', `Delete profile "${p.name}"?`, 'Delete')) profiles.deleteProfile(id);
}

async function exportProfile(id: string) {
  const res = await profiles.exportProfile(id);
  if (res.success) $q.notify({ message: 'Profile exported', color: 'positive', timeout: 1500 });
  else if (res.error !== 'Cancelled') $q.notify({ message: `Export failed: ${res.error}`, color: 'negative' });
}

async function importProfile() {
  const res = await profiles.importProfile();
  if (res.success) $q.notify({ message: `Imported profile "${res.name}"`, color: 'positive', timeout: 1500 });
  else if (res.error !== 'Cancelled') $q.notify({ message: `Import failed: ${res.error}`, color: 'negative' });
}

async function newWorkspace() {
  if (!await confirmReplace('New workspace')) return;
  await profiles.newWorkspace();
}
</script>
