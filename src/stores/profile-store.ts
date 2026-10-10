import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { loadDecoders } from '../decoders';
import { useModbusStore } from './modbus-store';
import { emptyWorkspace, normalizeWorkspace, type Workspace } from './workspace';

// The current workspace is saved automatically (restored on the next start); named profiles
// are explicit snapshots of it. Everything lives in one file managed by the backend.

export interface Profile {
  id: string;
  name: string;
  savedAt: string;
  workspace: Workspace;
}

interface ProfilesFile {
  version: 1;
  activeProfileId: string | null;
  current: Workspace;
  profiles: Profile[];
}

const PROFILE_FILE_TYPE = 'modbus-client-profile';
const SAVE_DELAY_MS = 500;

type Result = { success: boolean; error?: string };

export const useProfileStore = defineStore('profiles', () => {
  const modbus = useModbusStore();

  const profiles = ref<Profile[]>([]);
  const activeProfileId = ref<string | null>(null);
  const ready = ref(false); // Saving starts only after the stored state was restored

  const activeProfile = computed(() => profiles.value.find(p => p.id === activeProfileId.value) ?? null);

  // Normalized so it compares equal to a stored profile with the same content
  const currentJson = computed(() => JSON.stringify(normalizeWorkspace(modbus.getWorkspace())));
  const isModified = computed(() =>
    !!activeProfile.value && JSON.stringify(activeProfile.value.workspace) !== currentJson.value);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const data: ProfilesFile = {
      version: 1,
      activeProfileId: activeProfileId.value,
      current: JSON.parse(currentJson.value) as Workspace,
      profiles: profiles.value,
    };
    const res = await window.myAPI.saveProfiles(data);
    if (!res.success) modbus.addLog(`Saving profiles failed: ${res.error}`);
  }

  function schedulePersist() {
    if (!ready.value) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void persist(); }, SAVE_DELAY_MS);
  }

  watch([currentJson, profiles, activeProfileId], schedulePersist, { deep: true });

  /** Restores the last session. Call once on startup. */
  async function init() {
    // Devices need their decoders before polling can be restarted
    await loadDecoders();
    const res = await window.myAPI.loadProfiles();
    if (res.success && res.data) {
      const file = res.data;
      profiles.value = (Array.isArray(file.profiles) ? file.profiles as Record<string, unknown>[] : [])
        .filter(p => typeof p.id === 'string' && typeof p.name === 'string')
        .map(p => ({
          id: p.id as string,
          name: p.name as string,
          savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
          workspace: normalizeWorkspace(p.workspace),
        }));
      const activeId = typeof file.activeProfileId === 'string' ? file.activeProfileId : null;
      activeProfileId.value = profiles.value.some(p => p.id === activeId) ? activeId : null;
      if (file.current) modbus.applyWorkspace(normalizeWorkspace(file.current));
      const { devices, collectors } = modbus;
      if (devices.length || collectors.length) {
        modbus.addLog(`Restored last session: ${devices.length} devices, ${collectors.length} collectors`);
      }
    } else if (!res.success) {
      modbus.addLog(`Loading profiles failed: ${res.error}`);
    }
    ready.value = true;
  }

  async function applyAndDisconnect(ws: Workspace) {
    if (modbus.connectionStatus === 'connected') await modbus.disconnect();
    modbus.applyWorkspace(ws);
  }

  async function loadProfile(id: string) {
    const p = profiles.value.find(x => x.id === id);
    if (!p) return;
    await applyAndDisconnect(normalizeWorkspace(p.workspace));
    activeProfileId.value = p.id;
    modbus.addLog(`Loaded profile: ${p.name}`);
  }

  function saveActiveProfile() {
    const p = activeProfile.value;
    if (!p) return;
    p.workspace = JSON.parse(currentJson.value) as Workspace;
    p.savedAt = new Date().toISOString();
    modbus.addLog(`Saved profile: ${p.name}`);
  }

  function saveProfileAs(name: string) {
    const p: Profile = {
      id: Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      workspace: JSON.parse(currentJson.value) as Workspace,
    };
    profiles.value.push(p);
    activeProfileId.value = p.id;
    modbus.addLog(`Saved profile: ${name}`);
  }

  function renameProfile(id: string, name: string) {
    const p = profiles.value.find(x => x.id === id);
    if (p) p.name = name;
  }

  function deleteProfile(id: string) {
    profiles.value = profiles.value.filter(p => p.id !== id);
    if (activeProfileId.value === id) activeProfileId.value = null;
  }

  /** Clears devices and collectors, keeps the connection settings. */
  async function newWorkspace() {
    await applyAndDisconnect(emptyWorkspace(modbus.getWorkspace().connection));
    activeProfileId.value = null;
  }

  async function exportProfile(id: string): Promise<Result> {
    const p = profiles.value.find(x => x.id === id);
    if (!p) return { success: false, error: 'Profile not found' };
    const fileName = `${p.name.replace(/[^\w.-]+/g, '_') || 'profile'}.json`;
    return window.myAPI.exportProfile({ type: PROFILE_FILE_TYPE, version: 1, name: p.name, workspace: p.workspace }, fileName);
  }

  /** Imports a profile file as a new profile (does not load it). */
  async function importProfile(): Promise<Result & { name?: string }> {
    const res = await window.myAPI.importProfile();
    if (!res.success || !res.data) return { success: false, error: res.error };
    const data = res.data;
    if (data.type !== PROFILE_FILE_TYPE) return { success: false, error: 'Not a Modbus Client profile file' };
    const base = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported profile';
    let name = base;
    for (let i = 2; profiles.value.some(p => p.name === name); i++) name = `${base} (${i})`;
    profiles.value.push({
      id: Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      workspace: normalizeWorkspace(data.workspace),
    });
    modbus.addLog(`Imported profile: ${name}`);
    return { success: true, name };
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    isModified,
    init,
    persist,
    loadProfile,
    saveActiveProfile,
    saveProfileAs,
    renameProfile,
    deleteProfile,
    newWorkspace,
    exportProfile,
    importProfile,
  };
});
