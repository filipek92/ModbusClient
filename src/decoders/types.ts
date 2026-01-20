export type RegisterType = 'holding' | 'input' | 'coil' | 'discrete';
export type DataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'boolean';

export interface DecoderField {
  address: number;
  type: RegisterType;
  name: string;
  dataType: DataType;
  unit?: string;
  scale?: number; // Multiply raw value by this
  precision?: number; // Number of decimals
  wordOrder?: 'big-endian' | 'little-endian'; // For 32-bit values (High-Low vs Low-High)
  transform?: string; // JavaScript lambda body: (value, rawContext) => return ...
  map?: Record<number, string>; // Enum mapping for value
}

export interface DeviceDecoder {
  id: string;
  name: string;
  defaultSlaveId: number;
  fields: DecoderField[];
}
