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
  lastUpdate: string | null;
  values: Record<string, string | number>; // fieldName -> formatted value
  rawValues: Record<string, number | boolean>; // fieldName -> raw numeric/boolean value (scaled)
}

export const useModbusStore = defineStore('modbus', () => {
  // State
  const connectionStatus = ref('disconnected');
  const logs = ref<LogEntry[]>([]);
  const trafficStats = ref({ txBytes: 0, rxBytes: 0, txMsg: 0, rxMsg: 0 });
  const collectors = ref<Collector[]>([]);
  const devices = ref<ActiveDevice[]>([]);
  
  // Connection Settings (UI state)
  const connectionType = ref<'tcp' | 'rtu'>('tcp');
  
  // IP History
  const ipHistory = ref<string[]>(JSON.parse(localStorage.getItem('modbus_ip_history') || '[]'));
  
  const tcpHost = ref(ipHistory.value.length > 0 ? ipHistory.value[0] : '127.0.0.1');
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
      const res = await window.myAPI.connectTCP(tcpHost.value, tcpPort.value);
      if (res.success) {
        // Save to history
        const host = tcpHost.value;
        const newHistory = ipHistory.value.filter(h => h !== host);
        newHistory.unshift(host);
        if (newHistory.length > 10) newHistory.pop();
        ipHistory.value = newHistory;
        localStorage.setItem('modbus_ip_history', JSON.stringify(newHistory));
      }
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
      addLog(`Read [${manualType.value}] ID:${manualSlaveId.value} Addr:${manualStart.value}: ${JSON.stringify(res.data)}`);
    } else {
      manualData.value = null;
      manualResult.value = 'Error: ' + res.error;
      addLog(`Read Error [${manualType.value}] ID:${manualSlaveId.value} Addr:${manualStart.value}: ${res.error}`);
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
        addLog(`Write [${manualType.value}] ID:${manualSlaveId.value} Addr:${manualStart.value} Val:${valString}`);
      } else {
        manualResult.value = 'Write Error: ' + res.error;
        addLog(`Write Error [${manualType.value}] ID:${manualSlaveId.value} Addr:${manualStart.value}: ${res.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      manualResult.value = 'Write Exception: ' + msg;
      addLog(`Write Exception: ${msg}`);
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
      lastUpdate: null,
      values: {},
      rawValues: {}
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

       for (const [type, allFields] of groups) {
         if (allFields.length === 0) continue;
         
         // Sort fields by address
         allFields.sort((a, b) => a.address - b.address);

         // Chunk fields into batches to respect Modbus limits
         const batches: DecoderField[][] = [];
         let currentBatch: DecoderField[] = [];
         let batchStart = -1;
         
         // Modbus Max PDU size is usually ~253 bytes.
         // Read Holding (0x03) response: 1 byte (func) + 1 byte (len) + N*2 bytes data.
         // Max data bytes = 250 => 125 registers.
         // Safely stick to 100 registers.
         // For Coils, 2000 bits is the limit.
         const MAX_REGISTER_COUNT = (type === 'coil' || type === 'discrete') ? 1900 : 100;

         allFields.forEach(f => {
            const len = (f.dataType === 'uint32' || f.dataType === 'int32' || f.dataType === 'float32') ? 2 : 1;
            const fEnd = f.address + len - 1;
            
            if (currentBatch.length === 0) {
               currentBatch = [f];
               batchStart = f.address;
            } else {
               // Calculate hypothetical end if we include this field
               // If the span from batchStart to fEnd > MAX, start new batch
               const neededCount = fEnd - batchStart + 1;
               
               if (neededCount > MAX_REGISTER_COUNT) {
                   batches.push(currentBatch);
                   currentBatch = [f];
                   batchStart = f.address;
               } else {
                   currentBatch.push(f);
               }
            }
         });
         if (currentBatch.length > 0) batches.push(currentBatch);

         // Process each batch independently
         for (const fields of batches) {
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
                      if (f.wordOrder === 'little-endian') {
                         val = (regs[offset+1] << 16) | regs[offset];
                      } else {
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

                // Store raw value (scaled and precision adjusted)
                if (typeof val === 'number' || typeof val === 'boolean') {
                   d.rawValues[f.name] = val;
                }

                // Apply Map
                if (typeof val === 'number' && f.map) {
                   const mapVal = f.map[val];
                   if (mapVal) {
                      val = `${val} (${mapVal})`; // Display format
                   }
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
              d.lastUpdate = new Date().toLocaleTimeString();
            } else {
              d.error = res.error || 'Read Failed';
            }
         }
       }

    }, d.interval);
  }

  async function writeDeviceValue(deviceId: string, fieldName: string, value: string | number) {
    const d = devices.value.find(x => x.id === deviceId);
    if (!d) return;
    const decoder = getDecoder(d.decoderId);
    if (!decoder) return;
    const field = decoder.fields.find(f => f.name === fieldName);
    if (!field) return;

    // Convert value back to raw register value
    let valToWrite = Number(value);
    
    // Reverse scale
    if (field.scale) {
      valToWrite = valToWrite / field.scale;
    }

    // Integers only for now
    valToWrite = Math.round(valToWrite);

    // Write
    try {
      const res = await window.myAPI.writeModbus('holding', d.slaveId, field.address, [valToWrite]);
      if (!res.success) {
        d.error = 'Write Failed: ' + res.error;
        addLog(`Write Device Error [${d.name}] ${fieldName}: ${res.error}`);
      } else {
        addLog(`Write Device Success [${d.name}] ${fieldName}: ${value}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      d.error = 'Write Exception: ' + msg;
      addLog(`Write Device Exception [${d.name}]: ${msg}`);
    }
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
    ipHistory,
    connectionStatus,
    logs,
    trafficStats,
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
    writeDeviceValue,
    availableDecoders // Expose list
  };
});
