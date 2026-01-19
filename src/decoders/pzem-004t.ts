import type { DeviceDecoder } from './types';

export const pzem004t: DeviceDecoder = {
  id: 'pzem-004t-v3',
  name: 'PZEM-004T v3.0 Energy Meter',
  defaultSlaveId: 1,
  fields: [
    {
      address: 0x0000,
      type: 'input',
      name: 'Voltage',
      dataType: 'uint16',
      unit: 'V',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0001,
      type: 'input',
      name: 'Current',
      dataType: 'uint32',
      unit: 'A',
      scale: 0.001,
      precision: 3,
      wordOrder: 'little-endian' // 0x0001 is Low, 0x0002 is High
    },
    {
      address: 0x0003,
      type: 'input',
      name: 'Power',
      dataType: 'uint32',
      unit: 'W',
      scale: 0.1,
      precision: 1,
      wordOrder: 'little-endian'
    },
    {
      address: 0x0005,
      type: 'input',
      name: 'Energy',
      dataType: 'uint32',
      unit: 'Wh',
      scale: 1,
      precision: 0,
      wordOrder: 'little-endian',
      // Just illustrating the field existence, though logic might be redundant with unit
      // transform: "return value;" 
      transform: "return value > 1000 ? (value/1000).toFixed(2) + ' kWh' : value + ' Wh';"

    },
    {
      address: 0x0007,
      type: 'input',
      name: 'Frequency',
      dataType: 'uint16',
      unit: 'Hz',
      scale: 0.1,
      precision: 1
    },
    {
      address: 0x0008,
      type: 'input',
      name: 'Power Factor',
      dataType: 'uint16',
      unit: '',
      scale: 0.01,
      precision: 2
    },
    {
      address: 0x0009,
      type: 'input',
      name: 'Alarm Status',
      dataType: 'uint16',
      unit: '',
      scale: 1
    }
  ]
};
