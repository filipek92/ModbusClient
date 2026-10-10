import type { RegisterType } from './modbus-store';

// Persisted part of the app state: connection settings, devices, collectors and manual query
// inputs. Runtime values (timers, last readings, errors) are never stored.

export type ConnectionType = 'tcp' | 'rtu' | 'rtu-over-tcp';

export interface WorkspaceConnection {
  type: ConnectionType;
  tcpHost: string;
  tcpPort: number;
  rtuPath: string;
  rtuBaudRate: number;
  rtuParity: string;
  rtuDataBits: number;
  rtuStopBits: number;
}

export interface WorkspaceDevice {
  id: string;
  decoderId: string;
  slaveId: number;
  name: string;
  enabled: boolean;
  interval: number;
}

export interface WorkspaceCollector {
  id: string;
  enabled: boolean;
  type: RegisterType;
  slaveId: number;
  startAddress: number;
  length: number;
  interval: number;
  name: string;
  jsConversion: string;
  unit: string;
}

export interface WorkspaceManual {
  type: RegisterType;
  slaveId: number;
  start: number;
  length: number;
}

export interface Workspace {
  connection: WorkspaceConnection;
  devices: WorkspaceDevice[];
  collectors: WorkspaceCollector[];
  manual: WorkspaceManual;
}

const REGISTER_TYPES: RegisterType[] = ['holding', 'input', 'coil', 'discrete'];
const CONNECTION_TYPES: ConnectionType[] = ['tcp', 'rtu', 'rtu-over-tcp'];

type Obj = Record<string, unknown>;

const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const num = (v: unknown, def: number) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : def;
};
const oneOf = <T extends string>(v: unknown, allowed: T[], def: T): T =>
  (allowed.includes(v as T) ? v as T : def);

let idCounter = 0;
const newId = () => `${Date.now()}-${idCounter++}`;

/**
 * Builds a complete workspace from untrusted JSON (profile file, import, older app version),
 * filling missing or invalid values with defaults. Key order is fixed, so two normalized
 * workspaces can be compared via JSON.stringify.
 */
export function normalizeWorkspace(raw: unknown): Workspace {
  const w = asObj(raw);
  const c = asObj(w.connection);
  const m = asObj(w.manual);
  return {
    connection: {
      type: oneOf(c.type, CONNECTION_TYPES, 'tcp'),
      tcpHost: str(c.tcpHost, '127.0.0.1'),
      tcpPort: num(c.tcpPort, 502),
      rtuPath: str(c.rtuPath, '/dev/ttyUSB0'),
      rtuBaudRate: num(c.rtuBaudRate, 9600),
      rtuParity: str(c.rtuParity, 'none'),
      rtuDataBits: num(c.rtuDataBits, 8),
      rtuStopBits: num(c.rtuStopBits, 1),
    },
    devices: asArr(w.devices)
      .map(asObj)
      .filter(d => typeof d.decoderId === 'string' && d.decoderId !== '')
      .map(d => ({
        id: str(d.id, '') || newId(),
        decoderId: d.decoderId as string,
        slaveId: num(d.slaveId, 1),
        name: str(d.name, d.decoderId as string),
        enabled: bool(d.enabled, false),
        interval: num(d.interval, 2000),
      })),
    collectors: asArr(w.collectors)
      .map(asObj)
      .map(col => ({
        id: str(col.id, '') || newId(),
        enabled: bool(col.enabled, false),
        type: oneOf(col.type, REGISTER_TYPES, 'holding'),
        slaveId: num(col.slaveId, 1),
        startAddress: num(col.startAddress, 0),
        length: num(col.length, 1),
        interval: num(col.interval, 1000),
        name: str(col.name, 'Collector'),
        jsConversion: str(col.jsConversion, 'return value[0];'),
        unit: str(col.unit, ''),
      })),
    manual: {
      type: oneOf(m.type, REGISTER_TYPES, 'holding'),
      slaveId: num(m.slaveId, 1),
      start: num(m.start, 0),
      length: num(m.length, 1),
    },
  };
}

export function emptyWorkspace(connection?: WorkspaceConnection): Workspace {
  const ws = normalizeWorkspace({});
  if (connection) ws.connection = { ...connection };
  return ws;
}
