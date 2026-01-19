import { pzem004t } from './pzem-004t';
import type { DeviceDecoder } from './types';

export const availableDecoders: DeviceDecoder[] = [
  pzem004t
];

export function getDecoder(id: string): DeviceDecoder | undefined {
  return availableDecoders.find(d => d.id === id);
}
