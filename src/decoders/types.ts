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

// Value in an operation step: a literal number or a "{paramName}" reference
export type OperationValue = number | string;

export interface OperationParam {
  name: string; // referenced from steps as "{name}"
  label?: string;
  type?: 'number' | 'select'; // default: number
  min?: number;
  max?: number;
  default?: number | string; // number or "{slaveId}" (current device Slave ID)
  options?: Record<number, string>; // for type 'select'
}

export interface OperationStep {
  action: 'write' | 'delay';
  // write
  type?: 'holding' | 'coil'; // default: holding
  address?: number;
  value?: OperationValue | OperationValue[];
  strategy?: 'single' | 'multiple'; // FC 06/05 vs FC 16/15
  slaveId?: OperationValue; // default: current device Slave ID
  ignoreError?: boolean; // continue even if the device does not answer
  // delay
  ms?: number;
}

export interface DeviceOperation {
  id: string;
  name: string;
  description?: string;
  confirm?: string; // confirmation question shown before running
  params?: OperationParam[];
  steps: OperationStep[];
  setSlaveId?: OperationValue; // after success, change the device Slave ID in the app
}

export interface DeviceDecoder {
  id: string;
  name: string;
  defaultSlaveId: number;
  maxReadCount?: number; // Max registers per single read request (device limit)
  fields: DecoderField[];
  operations?: DeviceOperation[]; // Multi-step write procedures (e.g. change address + save)
  isDefault?: boolean;
}
