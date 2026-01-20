import type { DeviceDecoder } from './types';

export const atreaAmotion: DeviceDecoder = {
  id: 'atrea-amotion',
  name: 'Atrea aMotion',
  defaultSlaveId: 1,
  fields: [
    {
      address: 1001,
      type: 'holding',
      name: 'Režim',
      dataType: 'uint16',
      unit: '',
      scale: 1,
      map: {
        0: 'OFF',
        1: 'AUTO',
        2: 'VENTILATION',
        3: 'CIRCULATION',
        4: 'NIGHT_COOLING',
        5: 'BALANCE',
        6: 'OVERPRESSURE',
        7: 'UNDERPRESSURE'
      }
    },
    {
      address: 1002,
      type: 'holding',
      name: 'Požadovaná teplota',
      dataType: 'int16',
      unit: '°C',
      scale: 0.1,
      precision: 1
    },
    {
      address: 1003,
      type: 'holding',
      name: 'Zvolená zóna',
      dataType: 'uint16',
      unit: '',
      scale: 1
    },
    {
      address: 1004,
      type: 'holding',
      name: 'Požadovaný výkon',
      dataType: 'uint16',
      unit: '%',
      scale: 1
    },
    {
      address: 1005,
      type: 'holding',
      name: 'Požadovaný výkon větrání',
      dataType: 'uint16',
      unit: 'm3/h',
      scale: 10
    },
    {
      address: 1006,
      type: 'holding',
      name: 'Požadovaný výkon přívodu',
      dataType: 'uint16',
      unit: 'm3/h',
      scale: 10
    },
    {
      address: 1007,
      type: 'holding',
      name: 'Požadovaná úroveň tlaku',
      dataType: 'uint16',
      unit: '',
      scale: 1
    },
    {
      address: 1008,
      type: 'holding',
      name: 'Poloha cirkulační klapky',
      dataType: 'uint16',
      unit: '%',
      scale: 1
    },
    {
      address: 1009,
      type: 'holding',
      name: 'Bypass - Řídicí povel',
      dataType: 'uint16',
      unit: '',
      scale: 1
    },
    {
      address: 1010,
      type: 'holding',
      name: 'Nastavení sezóny',
      dataType: 'uint16',
      unit: '',
      scale: 1,
      map: {
        0: 'AUTO_TODA',
        1: 'HEATING',
        2: 'COOLING',
        3: 'OFF'
      }
    },
    {
      address: 1011,
      type: 'holding',
      name: 'Požadovaný výkon - přívod',
      dataType: 'uint16',
      unit: '%',
      scale: 1
    },
    {
      address: 1012,
      type: 'holding',
      name: 'Požadovaný výkon - odvod',
      dataType: 'uint16',
      unit: '%',
      scale: 1
    },
    {
      address: 1013,
      type: 'holding',
      name: 'Požadovaný průtok SUP (přívod)',
      dataType: 'uint16',
      unit: 'm3/h',
      scale: 10
    },
    {
      address: 1014,
      type: 'holding',
      name: 'Požadovaný průtok ETA (odvod)',
      dataType: 'uint16',
      unit: 'm3/h',
      scale: 10
    },
    {
      address: 1500,
      type: 'holding',
      name: 'Teplota - vnitřní vzduch',
      dataType: 'int16',
      unit: '°C',
      scale: 0.1,
      precision: 1
    },
    {
      address: 1501,
      type: 'holding',
      name: 'Teplota - venkovní vzduch',
      dataType: 'int16',
      unit: '°C',
      scale: 0.1,
      precision: 1
    },
    {
      address: 3189,
      type: 'holding',
      name: 'Aktivní kalendář',
      dataType: 'uint16',
      unit: '',
      scale: 1
    },
    {
      address: 3190,
      type: 'holding',
      name: 'Aktivní scéna',
      dataType: 'uint16',
      unit: '',
      scale: 1
    }
  ]
};
