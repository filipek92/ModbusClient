import type { DeviceDecoder } from './types';

export const solaxMonitoring: DeviceDecoder = {
  id: 'solax-monitoring',
  name: 'Solax Hybrid - Monitoring',
  defaultSlaveId: 1,
  fields: [
    // --- Inverter Status ---
    {
      address: 0x0000,
      type: 'input',
      name: 'Grid Voltage',
      dataType: 'uint16',
      unit: 'V',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0001,
      type: 'input',
      name: 'Grid Current',
      dataType: 'int16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0002,
      type: 'input',
      name: 'Grid Power',
      dataType: 'int16',
      unit: 'W',
      scale: 1,
      precision: 0
    },
    {
       address: 0x0007,
       type: 'input',
       name: 'Grid Frequency',
       dataType: 'uint16',
       unit: 'Hz',
       scale: 0.01,
       precision: 2
    },
    {
       address: 0x0008,
       type: 'input',
       name: 'Inverter Temperature',
       dataType: 'int16',
       unit: '°C',
       scale: 1,
       precision: 0
     },
    {
       address: 0x0009,
       type: 'input',
       name: 'Run Mode',
       dataType: 'uint16',
       map: {
         0: 'Waiting',
         1: 'Checking',
         2: 'Normal',
         3: 'Fault',
         4: 'Permanent Fault'
       }
     },
    // --- PV Logic ---
    {
      address: 0x0003,
      type: 'input',
      name: 'PV1 Voltage',
      dataType: 'uint16',
      unit: 'V',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0004,
      type: 'input',
      name: 'PV2 Voltage',
      dataType: 'uint16',
      unit: 'V',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0005,
      type: 'input',
      name: 'PV1 Current',
      dataType: 'uint16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0006,
      type: 'input',
      name: 'PV2 Current',
      dataType: 'uint16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x000A,
      type: 'input',
      name: 'Pv1 Power',
      dataType: 'uint16',
      unit: 'W',
      scale: 1
    },
    {
      address: 0x000B,
      type: 'input',
      name: 'Pv2 Power',
      dataType: 'uint16',
      unit: 'W',
      scale: 1
    },
    // --- Battery ---
    {
      address: 0x0014,
      type: 'input',
      name: 'Battery Voltage',
      dataType: 'int16',
      unit: 'V',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0015,
      type: 'input',
      name: 'Battery Current',
      dataType: 'int16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0016,
      type: 'input',
      name: 'Battery Power',
      dataType: 'int16',
      unit: 'W',
      scale: 1,
      precision: 0,
       transform: "return value > 0 ? 'Charging ' + value + 'W' : 'Discharging ' + Math.abs(value) + 'W';"
    },
    {
      address: 0x0017,
      type: 'input',
      name: 'BMS Connect State',
      dataType: 'uint16',
      map: {
        0: 'Disconnected',
        1: 'Connected'
      }
    },
    {
      address: 0x0018,
      type: 'input',
      name: 'Battery Temperature',
      dataType: 'int16',
      unit: '°C',
      scale: 1
    },
    {
       // Assumed based on common Solax, though not in your short snippet. Often 0x1C.
       // Keeping it just in case, feel free to remove if it returns 0.
      address: 0x001C,
      type: 'input',
      name: 'Battery SOC',
      dataType: 'uint16',
      unit: '%',
      scale: 1,
      precision: 0
    },
    // --- Grid (Meter) ---
    {
      address: 0x0046,
      type: 'input',
      name: 'Feed-in Power (Total)',
      dataType: 'int32',
      unit: 'W',
      scale: 1,
      precision: 0,
      wordOrder: 'little-endian' 
    },
    // --- Enrgy Yield ---
    {
      address: 0x0094,
      type: 'input',
      name: 'Total Energy Yield',
      dataType: 'uint32',
      unit: 'kWh',
      scale: 0.1,
      precision: 1,
      wordOrder: 'little-endian'
    }
  ]
};
