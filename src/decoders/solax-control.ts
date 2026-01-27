import type { DeviceDecoder } from './types';

export const solaxControl: DeviceDecoder = {
  id: 'solax-control',
  name: 'Solax Hybrid - Control',
  defaultSlaveId: 1,
  fields: [
    {
      address: 0x001F,
      type: 'holding',
      name: 'Charger Use Mode',
      dataType: 'uint16',
      map: {
        0: 'Self Use',
        1: 'Force Time Use',
        2: 'Back Up Mode',
        3: 'Feed-in Priority'
      }
    },
    {
      address: 0x0027,
      type: 'holding',
      name: 'Battery Max Charge Current',
      dataType: 'uint16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0028,
      type: 'holding',
      name: 'Battery Max Discharge Current',
      dataType: 'uint16',
      unit: 'A',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x002F,
      type: 'holding',
      name: 'Min SOC (Grid Tied)',
      dataType: 'uint16',
      unit: '%',
      scale: 1,
      precision: 0
    },
    {
      address: 0x0030,
      type: 'holding',
      name: 'Min SOC (Backup)',
      dataType: 'uint16',
      unit: '%',
      scale: 1,
      precision: 0
    },
    {
      address: 0x003C,
      type: 'holding',
      name: 'Force Charge Power Limit',
      dataType: 'uint16',
      unit: 'W',
      scale: 1,
      precision: 0
    },
    {
      address: 0x003D,
      type: 'holding',
      name: 'Force Discharge Power Limit',
      dataType: 'uint16',
      unit: 'W',
      scale: 1,
      precision: 0
    },
    {
      address: 0x0041,
      type: 'holding',
      name: 'Force Charge/Discharge Period 1 Start',
      dataType: 'uint16',
      unit: '',
      transform: "return Math.floor(value / 256) + ':' + (value % 256).toString().padStart(2, '0');"
    },
    {
      address: 0x0042,
      type: 'holding',
      name: 'Force Charge/Discharge Period 1 End',
      dataType: 'uint16',
      unit: '',
      transform: "return Math.floor(value / 256) + ':' + (value % 256).toString().padStart(2, '0');"
    },
    {
      address: 0x0043,
      type: 'holding',
      name: 'Force Charge/Discharge Enable (Period 1)',
      dataType: 'uint16',
      map: {
        0: 'Disabled',
        1: 'Charge',
        2: 'Discharge'
      }
    }
  ]
};
