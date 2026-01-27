import { pzem004t } from './pzem-004t';
import { atreaAmotion } from './atrea-amotion';
import { solaxMonitoring } from './solax-monitoring';
import { solaxControl } from './solax-control';
import type { DeviceDecoder } from './types';

export const availableDecoders: DeviceDecoder[] = [
  pzem004t,
  atreaAmotion,
  solaxMonitoring,
  solaxControl
];

export function getDecoder(id: string): DeviceDecoder | undefined {
  return availableDecoders.find(d => d.id === id);
}
