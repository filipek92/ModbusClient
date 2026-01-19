import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('myAPI', {
  // Connection
  connectRTU: (path: string, baudRate: number, parity: string, dataBits: number, stopBits: number) => ipcRenderer.invoke('connect-rtu', { path, baudRate, parity, dataBits, stopBits }),
  connectTCP: (host: string, port: number) => ipcRenderer.invoke('connect-tcp', { host, port }),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  
  // Modbus Actions
  readModbus: (type: string, id: number, start: number, length: number) => ipcRenderer.invoke('read-modbus', { type, id, start, length }),
  writeModbus: (type: string, id: number, address: number, values: number | number[] | boolean | boolean[] | string | string[]) => ipcRenderer.invoke('write-modbus', { type, id, address, values }),
  
  // Logging Event Listener
  onLog: (callback: (msg: string) => void) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
  
  // Status Listener
  onStatusChange: (callback: (status: string) => void) => ipcRenderer.on('status-change', (_event, value) => callback(value))
})
