import { boot } from 'quasar/wrappers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { IModbusAPI } from 'src/my-api';

// Bridge to the Rust backend (src-tauri). Replaces the former Electron preload script,
// so components keep using `window.myAPI` unchanged.

const on = <T>(event: string) => (callback: (payload: T) => void) => {
  void listen<T>(event, (e) => callback(e.payload));
};

const api: IModbusAPI = {
  // Connection
  connectRTU: (path, baudRate, parity, dataBits, stopBits) => invoke('connect_rtu', { args: { path, baudRate, parity, dataBits, stopBits } }),
  connectTCP: (host, port) => invoke('connect_tcp', { args: { host, port } }),
  connectRtuOverTcp: (host, port) => invoke('connect_rtu_tcp', { args: { host, port } }),
  disconnect: () => invoke('disconnect'),
  listSerialPorts: () => invoke('list_serial_ports'),

  // Modbus Actions
  readModbus: (type, id, start, length) => invoke('read_modbus', { args: { type, id, start, length } }),
  writeModbus: (type, id, address, values, strategy) => invoke('write_modbus', { args: { type, id, address, values, strategy } }),
  scanDevices: async (startId, endId, timeout, signal) => {
    if (signal?.aborted) return [];
    const onAbort = () => { void invoke('cancel_scan'); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await invoke<number[]>('scan_devices', { args: { startId, endId, timeout } });
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  },
  scanValues: (id, startAddr, count, value, types) => invoke('scan_values', { args: { id, startAddr, count, value, types } }),

  // Decoder Management
  getDecoders: () => invoke('get_decoders'),
  importDecoder: () => invoke('import_decoder'),
  exportDecoder: (decoderId) => invoke('export_decoder', { args: { decoderId } }),
  saveDecoder: (decoder) => invoke('save_decoder', { args: { decoder } }),
  deleteDecoder: (decoderId) => invoke('delete_decoder', { args: { decoderId } }),
  downloadDecoderPack: (url) => invoke('download_decoder_pack', { args: { url } }),

  // Profiles (workspace persistence)
  loadProfiles: () => invoke('load_profiles'),
  saveProfiles: (data) => invoke('save_profiles', { args: { data } }),
  exportProfile: (profile, fileName) => invoke('export_profile', { args: { profile, fileName } }),
  importProfile: () => invoke('import_profile'),

  // Auto Update
  checkForUpdates: () => invoke('check_for_updates'),
  downloadUpdate: () => invoke('download_update'),
  installUpdate: () => { void invoke('install_update'); },
  onUpdateAvailable: on('update-available'),
  onUpdateNotAvailable: on('update-not-available'),
  onUpdateError: on('update-error'),
  onUpdateDownloadProgress: on('update-download-progress'),
  onUpdateDownloaded: on('update-downloaded'),

  // Logging, status & progress events
  onLog: on('log-message'),
  onStatusChange: on('status-change'),
  onTrafficStats: on('traffic-stats'),
  onScanProgress: on('scan-progress'),
  onValueScanProgress: on('value-scan-progress'),
};

export default boot(() => {
  window.myAPI = api;
});
