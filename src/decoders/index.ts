import type { DeviceDecoder } from './types';
import { ref } from 'vue';

// Reactive list of decoders loaded from files via IPC
export const availableDecoders = ref<DeviceDecoder[]>([]);

/**
 * Load all decoders from main process (default + user JSON files).
 * Should be called on app startup and after import/save/delete operations.
 */
export async function loadDecoders(): Promise<void> {
  const result = await window.myAPI.getDecoders();
  if (result.success && result.data) {
    availableDecoders.value = result.data as DeviceDecoder[];
  }
}

export function getDecoder(id: string): DeviceDecoder | undefined {
  return availableDecoders.value.find(d => d.id === id);
}

export async function importDecoder(): Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }> {
  const result = await window.myAPI.importDecoder();
  if (result.success) {
    await loadDecoders();
  }
  return result;
}

export async function exportDecoder(decoderId: string): Promise<{ success: boolean; error?: string }> {
  return await window.myAPI.exportDecoder(decoderId);
}

export async function saveDecoder(decoder: DeviceDecoder): Promise<{ success: boolean; error?: string }> {
  const result = await window.myAPI.saveDecoder(decoder);
  if (result.success) {
    await loadDecoders();
  }
  return result;
}

export async function deleteDecoder(decoderId: string): Promise<{ success: boolean; error?: string }> {
  const result = await window.myAPI.deleteDecoder(decoderId);
  if (result.success) {
    await loadDecoders();
  }
  return result;
}

export async function downloadDecoderPack(url?: string): Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }> {
  const result = await window.myAPI.downloadDecoderPack(url);
  if (result.success) {
    await loadDecoders();
  }
  return result;
}
