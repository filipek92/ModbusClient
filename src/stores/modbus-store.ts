import { defineStore } from 'pinia';
import { ref } from 'vue';
import { availableDecoders, getDecoder } from '../decoders';
import type { DecoderField } from '../decoders/types';

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

export interface ActiveDevice {
  id: string; // unique
  decoderId: string;
  slaveId: number;
  name: string;
  enabled: boolean;
  interval: number;
  timerId: ReturnType<typeof setInterval> | null;
  error: string | null;
  values: Record<string, string | number>; // fieldName -> value
}

export const useModbusStore = defineStore('modbus', () => {
  // State
  const connectionStatus = ref('disconnected');
  const logs = ref<LogEntry[]>([]);
  const collectors = ref<Collector[]>([]);
  const devices = ref<ActiveDevice[]>([]);
  
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
  const manualData = ref<number[] | boolean[] | null>(null);
  const manualReadStart = ref(0); // Snapshot for displaying correct addresses
  const manualTimestamp = ref('');

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
    manualTimestamp.value = new Date().toLocaleString();
    
    if (res.success && res.data) {
      manualData.value = res.data;
      manualReadStart.value = manualStart.value;
      manualResult.value = 'Read Success';
    } else {
      manualData.value = null;
      manualResult.value = 'Error: ' + res.error;
    }
  }

  async function manualWrite() {
    manualData.value = null;
    manualTimestamp.value = new Date().toLocaleString();
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

  // --- Device Logic ---

  function addDevice(decoderId: string, slaveId: number) {
    const decoder = getDecoder(decoderId);
    if (!decoder) return;
    
    const dev: ActiveDevice = {
      id: Date.now().toString(),
      decoderId,
      slaveId,
      name: `${decoder.name} (ID: ${slaveId})`,
      enabled: false,
      interval: 2000,
      timerId: null,
      error: null,
      values: {}
    };
    devices.value.push(dev);
  }

  function removeDevice(id: string) {
    stopDevice(id);
    devices.value = devices.value.filter(d => d.id !== id);
  }

  function toggleDevice(id: string) {
    const d = devices.value.find(x => x.id === id);
    if (!d) return;
    if (d.enabled) stopDevice(id);
    else startDevice(id);
  }

  function startDevice(id: string) {
    const d = devices.value.find(x => x.id === id);
    if (!d) return;
    
    const decoder = getDecoder(d.decoderId);
    if (!decoder) {
      d.error = 'Decoder not found';
      return;
    }

    d.enabled = true;
    d.error = null;
    
    if (d.timerId) clearInterval(d.timerId);

    d.timerId = setInterval(async () => {
       if (connectionStatus.value !== 'connected') return;

       // Group fields by RegisterType to minimize requests
       // Simple approach: Iterate groups, find min/max addr
       const groups = new Map<string, DecoderField[]>();
       decoder.fields.forEach(f => {
         const key = f.type;
         if (!groups.has(key)) groups.set(key, []);
         groups.get(key)?.push(f);
       });

       for (const [type, fields] of groups) {
         if (fields.length === 0) continue;
         // Find min/max range
         // Note: Some fields are 2 words (uint32).
         let minAddr = Infinity;
         let maxAddr = -Infinity;

         fields.forEach(f => {
           if (f.address < minAddr) minAddr = f.address;
           const len = (f.dataType === 'uint32' || f.dataType === 'int32' || f.dataType === 'float32') ? 2 : 1;
           const end = f.address + len - 1;
           if (end > maxAddr) maxAddr = end;
         });

         const start = minAddr;
         const count = maxAddr - minAddr + 1;
         
         const res = await window.myAPI.readModbus(type as RegisterType, d.slaveId, start, count);
         if (res.success && res.data) {
           const raw = res.data; // array of numbers (if holding/input) or boolean
           
           fields.forEach(f => {
             // Parse value
             const offset = f.address - start;
             // Check bounds
             if (offset < 0 || offset >= raw.length) return;

             let val: number | string | boolean = 0;
             if (typeof raw[0] === 'boolean') {
                val = raw[offset] as boolean;
             } else {
                const regs = raw as number[];
                // Handle datatypes
                if (f.dataType === 'uint16') {
                   val = regs[offset];
                } else if (f.dataType === 'uint32') {
                   const low = regs[offset];
                   const high = regs[offset+1] || 0;
                   if (f.wordOrder === 'little-endian') {
                     val = (high << 16) | low; // Actually Pzem manual says: 0x0000 Low 16, 0x0001 High 16??
                     // Wait, usually Little Endian means first register is Low word.
                     // The example in pzem yaml said: 0x0001 Low, 0x0002 High => 0x0001 is offset 0.
                     // So val = (regs[offset+1] << 16) | regs[offset].
                     
                     // Standard Modbus usually big-endian words.
                     val = (high << 16) | low; 
                     
                     // If Little-Endian Words:
                     // 32-bit value in 2 registers.
                     // Big-Endian (default Modbus): Most Significant Register first.
                     // Little-Endian: Least Significant Register first.
                     if (f.wordOrder === 'little-endian') {
                        val = (regs[offset+1] << 16) | regs[offset];
                     } else {
                        val = (regs[offset] << 16) | regs[offset+1];
                     }

                   } else {
                      // Default Big Endian
                      val = (regs[offset] << 16) | regs[offset+1];
                   }
                   // FIX: JS bitwise ops are 32-bit signed. 
                   // To get unsigned uint32, use >>> 0
                   val = (val as number) >>> 0;

                } else if (f.dataType === 'int16') {
                   val = regs[offset];
                   if (val > 32767) val = val - 65536;
                }
                // TODO: float32, etc.
             }

             // Apply Scale
             if (typeof val === 'number' && f.scale) {
               val = val * f.scale;
             }
             
             // Apply Precision
             if (typeof val === 'number' && f.precision !== undefined) {
               val = parseFloat(val.toFixed(f.precision));
             }

             // Apply Lambda
             if (f.transform) {
                try {
                  const fn = new Function('value', f.transform);
                  val = fn(val);
                } catch { /* ignore */ }
             } else {
                // Formatting
                if (f.unit) val = `${val} ${f.unit}`;
             }

             d.values[f.name] = val as string | number;
           });
           
           d.error = null;
         } else {
           d.error = res.error || 'Read Failed';
         }
       }

    }, d.interval);
  }

  function stopDevice(id: string) {
    const d = devices.value.find(x => x.id === id);
    if (!d) return;
    d.enabled = false;
    if (d.timerId) {
      clearInterval(d.timerId);
      d.timerId = null;
    }
  }


  return {
    connectionStatus,
    logs,
    collectors,
    devices,
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
    manualData,
    manualReadStart,
    manualTimestamp,
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
    manualType,
    addDevice,
    removeDevice,
    toggleDevice,
    availableDecoders // Expose list
  };
});
