import { invoke } from "@tauri-apps/api/core";

export type DeviceIdentity = {
  deviceId: string;
  deviceName: string;
  createdAt: string;
};

export async function getOrCreateDeviceIdentity() {
  return invoke<DeviceIdentity>("get_or_create_device_identity");
}
