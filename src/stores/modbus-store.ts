import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface LogEntry {
  id: number;
  message: string;
}

export type RegisterType = 'holding' | 'input' | 'coil' | 'discrete';

export interface Collector {
  id: string;
  enabled: boolean;
  type: RegisterType;
  slaveId: number;
  startAddress: number;
  length: number;
  interval: number;
  name: string;
  jsConversion: string; 
  lastValue: string | number | null;
  error: string | null;
  timerId: ReturnType<typeof setInterval> | null;
}

export const useModbusStore = defineStore('modbus', () => {
  // State
  const connectionStatus = ref('disconnected');
  const logs = ref<LogEntry[]>([]);
  const collectors = ref<Collector[]>([]);
  
  // Connection Settings (UI state)
  const connectionType = ref<'tcp' | 'rtu'>('tcp');
  const tcpHost = ref('127.0.0.1');
  const tcpPort = ref(502);
  const rtuPath = ref('/dev/ttyUSB0');
  const rtuBaudRate = ref(9600);
  const rtuParity = ref('none');
  const rtuDataBits = ref(8);
  const rtuStopBits = ref(1);

  // Manual Query State
  const manualType = ref<RegisterType>('holding');
  const manualSlaveId = ref(1);
  const manualStart = ref(0);
  const manualLength = ref(1);
  const manualResult = ref<string>('');
  
  // Manual Write State
  const manualWriteValue = ref(''); // string for input, comma separated
  const manualWriteMode = ref<'read' | 'write'>('read');

  // Actions
  function addLog(message: string) {
    logs.value.push({ id: Date.now(), message });
    if (logs.value.length > 200) logs.value.shift();
  }

  function setStatus(status: string) {
    connectionStatus.value = status;
  }

  async function connect() {
    if (connectionType.value === 'tcp') {
      await window.myAPI.connectTCP(tcpHost.value, tcpPort.value);
    } else {
      await window.myAPI.connectRTU(rtuPath.value, rtuBaudRate.value, rtuParity.value, rtuDataBits.value, rtuStopBits.value);
    }
  }

  async function disconnect() {
    await window.myAPI.disconnect();
    // Stop all collectors
    collectors.value.forEach(c => stopCollector(c.id));
  }

  async function manualRead() {
    const res = await window.myAPI.readModbus(manualType.value, manualSlaveId.value, manualStart.value, manualLength.value);
    if (res.success && res.data) {
      manualResult.value = JSON.stringify(res.data);
    } else {
      manualResult.value = 'Error: ' + res.error;
    }
  }

  async function manualWrite() {
    try {
      if (manualType.value === 'input' || manualType.value === 'discrete') {
         manualResult.value = 'Error: Cannot write to Input Registers or Discrete Inputs';
         return;
      }

      // Parse values
      const valString = manualWriteValue.value.trim();
      if (!valString) {
        manualResult.value = 'Error: No value provided';
        return;
      }

      let values: number[] | boolean[];

      if (manualType.value === 'holding') {
        values = valString.split(',').map(v => parseInt(v.trim()));
        if (values.some(isNaN)) {
          manualResult.value = 'Error: Invalid number format (Holding requires integers)';
          return;
        }
      } else {
        // Coil
        values = valString.split(',').map(v => {
          const t = v.trim().toLowerCase();
          return (t === '1' || t === 'true' || t === 'on');
        });
      }

      const res = await window.myAPI.writeModbus(
        manualType.value as 'holding'|'coil', // only these 2 are allowed here
        manualSlaveId.value, 
        manualStart.value, 
        values
      );

      if (res.success) {
        manualResult.value = 'Write Success';
      } else {
        manualResult.value = 'Write Error: ' + res.error;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      manualResult.value = 'Write Exception: ' + msg;
    }
  }

  function addCollector() {
    collectors.value.push({
      id: Date.now().toString(),
      enabled: false,
      type: 'holding',
      slaveId: 1,
      startAddress: 0,
      length: 1,
      interval: 1000,
      name: 'New Collector',
      jsConversion: 'return value[0];',
      lastValue: null,
      error: null,
      timerId: null
    });
  }

  function toggleCollector(id: string) {
    const c = collectors.value.find(x => x.id === id);
    if (!c) return;
    
    if (c.enabled) {
      stopCollector(id);
    } else {
      startCollector(id);
    }
  }

  function startCollector(id: string) {
    const c = collectors.value.find(x => x.id === id);
    if (!c) return;

    c.enabled = true;
    c.error = null;
    
    if (c.timerId) clearInterval(c.timerId);

    c.timerId = setInterval(async () => {
      if (connectionStatus.value !== 'connected') return;

      const res = await window.myAPI.readModbus(c.type || 'holding', c.slaveId, c.startAddress, c.length);
      
      if (res.success && res.data) {
        try {
          // Eval the conversion
          // variable 'value' is the array of registers
          // user script should return something
          // We wrap in function
          const convert = new Function('value', c.jsConversion);
          const val = convert(res.data);
          c.lastValue = val;
          c.error = null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          c.error = 'JS Error: ' + msg;
        }
      } else {
        c.error = res.error || 'Read Failed';
      }

    }, c.interval);
  }

  function stopCollector(id: string) {
    const c = collectors.value.find(x => x.id === id);
    if (!c) return;
    c.enabled = false;
    if (c.timerId) {
      clearInterval(c.timerId);
      c.timerId = null;
    }
  }

  function removeCollector(id: string) {
    stopCollector(id);
    collectors.value = collectors.value.filter(c => c.id !== id);
  }

  return {
    connectionStatus,
    logs,
    collectors,
    connectionType,
    tcpHost,
    tcpPort,
    rtuPath,
    rtuBaudRate,
    rtuParity,
    rtuDataBits,
    rtuStopBits,
    manualSlaveId,
    manualStart,
    manualLength,
    manualResult,
    addLog,
    setStatus,
    connect,
    disconnect,
    manualRead,
    addCollector,
    toggleCollector,
    removeCollector,
    manualWriteValue,
    manualWriteMode,
    manualWrite,
    manualType
  };
});
