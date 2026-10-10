export interface IConnectRTU {
  path: string;
  baudRate: number;
  parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
  dataBits: number;
  stopBits: number;
}

export interface ISerialPort {
  path: string;
  description: string | null;
}

export interface IConnectTCP {
  host: string;
  port: number;
}

export interface IDecoderField {
  address: number;
  type: 'holding' | 'input' | 'coil' | 'discrete';
  name: string;
  dataType: 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'boolean';
  unit?: string;
  scale?: number;
  precision?: number;
  wordOrder?: 'big-endian' | 'little-endian';
  transform?: string;
  map?: Record<string, string>;
  readOnly?: boolean;
}

export interface IDeviceDecoder {
  id: string;
  name: string;
  defaultSlaveId: number;
  maxReadCount?: number;
  fields: IDecoderField[];
  operations?: unknown[];
  isDefault?: boolean;
}

export interface IModbusAPI {
  connectRTU: (path: string, baudRate: number, parity: string, dataBits: number, stopBits: number) => Promise<{ success: boolean; error?: string }>;
  connectTCP: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  connectRtuOverTcp: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean; error?: string }>;
  listSerialPorts: () => Promise<ISerialPort[]>;
  readModbus: (type: 'holding' | 'input' | 'coil' | 'discrete', id: number, start: number, length: number) => Promise<{ success: boolean; data?: number[] | boolean[], error?: string }>;
  writeModbus: (type: 'holding' | 'coil', id: number, address: number, values: number | number[] | boolean | boolean[] | string | string[], strategy?: 'single' | 'multiple') => Promise<{ success: boolean; error?: string }>;
  /** Aborting `signal` stops the scan after its current request; it resolves with the IDs found so far. */
  scanDevices: (startId: number, endId: number, timeout: number, signal?: AbortSignal) => Promise<number[]>;
  scanValues: (id: number, startAddr: number, count: number, value: number, types: ('holding' | 'input')[]) => Promise<{ address: number, type: 'holding' | 'input', value: number }[]>;
  
  // Decoder Management
  getDecoders: () => Promise<{ success: boolean; data?: IDeviceDecoder[]; error?: string }>;
  importDecoder: () => Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }>;
  exportDecoder: (decoderId: string) => Promise<{ success: boolean; error?: string }>;
  saveDecoder: (decoder: IDeviceDecoder) => Promise<{ success: boolean; error?: string }>;
  deleteDecoder: (decoderId: string) => Promise<{ success: boolean; error?: string }>;
  downloadDecoderPack: (url?: string) => Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }>;

  // Profiles (the content is defined by src/stores/profile-store.ts, the backend only stores it)
  loadProfiles: () => Promise<{ success: boolean; data?: Record<string, unknown> | null; error?: string }>;
  saveProfiles: (data: object) => Promise<{ success: boolean; error?: string }>;
  exportProfile: (profile: object, fileName: string) => Promise<{ success: boolean; error?: string }>;
  importProfile: () => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
  exportCsv: (content: string, fileName: string) => Promise<{ success: boolean; error?: string }>;
  
  // Auto Update
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => void;
  onUpdateAvailable: (callback: (info: Record<string, unknown>) => void) => void;
  onUpdateNotAvailable: (callback: (info: Record<string, unknown>) => void) => void;
  onUpdateError: (callback: (err: string) => void) => void;
  onUpdateDownloadProgress: (callback: (progress: Record<string, unknown>) => void) => void;
  onUpdateDownloaded: (callback: (info: Record<string, unknown>) => void) => void;

  onLog: (callback: (message: string) => void) => void;
  onStatusChange: (callback: (status: string) => void) => void;
  onTrafficStats: (callback: (stats: { txBytes: number, rxBytes: number, txMsg: number, rxMsg: number }) => void) => void;
  onScanProgress: (callback: (id: number) => void) => void;
  onValueScanProgress: (callback: (progress: number) => void) => void;
}

declare global {
  interface Window {
    myAPI: IModbusAPI;
  }
}
