import { contextBridge, ipcRenderer } from 'electron'

type TrafficStats = {
  txBytes: number;
  rxBytes: number;
  txMsg: number;
  rxMsg: number;
}

contextBridge.exposeInMainWorld('myAPI', {
  // Connection
  connectRTU: (path: string, baudRate: number, parity: string, dataBits: number, stopBits: number) => ipcRenderer.invoke('connect-rtu', { path, baudRate, parity, dataBits, stopBits }),
  connectTCP: (host: string, port: number) => ipcRenderer.invoke('connect-tcp', { host, port }),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  
  // Modbus Actions
  readModbus: (type: string, id: number, start: number, length: number) => ipcRenderer.invoke('read-modbus', { type, id, start, length }),
  writeModbus: (type: string, id: number, address: number, values: number | number[] | boolean | boolean[] | string | string[], strategy?: 'single' | 'multiple') => ipcRenderer.invoke('write-modbus', { type, id, address, values, strategy }),
  scanDevices: (startId: number, endId: number, timeout: number) => ipcRenderer.invoke('scan-devices', { startId, endId, timeout }),
  
  // Decoder Management
  getDecoders: () => ipcRenderer.invoke('get-decoders'),
  importDecoder: () => ipcRenderer.invoke('import-decoder'),
  exportDecoder: (decoderId: string) => ipcRenderer.invoke('export-decoder', { decoderId }),
  saveDecoder: (decoder: Record<string, unknown>) => ipcRenderer.invoke('save-decoder', { decoder }),
  deleteDecoder: (decoderId: string) => ipcRenderer.invoke('delete-decoder', { decoderId }),
  downloadDecoderPack: (url?: string) => ipcRenderer.invoke('download-decoder-pack', { url }),

  // Logging Event Listener
  onTrafficStats: (callback: (stats: TrafficStats) => void) => {
    ipcRenderer.on('traffic-stats', (_event, stats) => callback(stats))
  },
  onLog: (callback: (msg: string) => void) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
  
  // Status Listener
  onStatusChange: (callback: (status: string) => void) => ipcRenderer.on('status-change', (_event, value) => callback(value)),
  onScanProgress: (callback: (id: number) => void) => ipcRenderer.on('scan-progress', (_event, value) => callback(value))
})
