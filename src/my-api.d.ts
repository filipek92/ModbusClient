export interface IConnectRTU {
  path: string;
  baudRate: number;
  parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
  dataBits: number;
  stopBits: number;
}

export interface IConnectTCP {
  host: string;
  port: number;
}

export interface IModbusAPI {
  connectRTU: (path: string, baudRate: number, parity: string, dataBits: number, stopBits: number) => Promise<{ success: boolean; error?: string }>;
  connectTCP: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean; error?: string }>;
  readModbus: (type: 'holding' | 'input' | 'coil' | 'discrete', id: number, start: number, length: number) => Promise<{ success: boolean; data?: number[] | boolean[], error?: string }>;
  writeModbus: (type: 'holding' | 'coil', id: number, address: number, values: number | number[] | boolean | boolean[] | string | string[]) => Promise<{ success: boolean; error?: string }>;
  onLog: (callback: (message: string) => void) => void;
  onStatusChange: (callback: (status: string) => void) => void;
}

declare global {
  interface Window {
    myAPI: IModbusAPI;
  }
}
