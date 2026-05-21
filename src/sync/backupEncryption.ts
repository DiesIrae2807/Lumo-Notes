import { invoke } from "@tauri-apps/api/core";

export type CloudBackupPasswordMetadata = {
  salt: string;
  verifier: string;
  kdfAlgorithm: string;
  kdfParams: string;
  encryptionAlgorithm: string;
};

export type EncryptedCloudBackup = {
  format: "lumo-cloud-backup-v1";
  kdfAlgorithm: string;
  kdfParams: string;
  encryptionAlgorithm: string;
  salt: string;
  passwordVerifier?: string | null;
  nonce: string;
  ciphertextBase64: string;
  checksum: string;
};

export async function createCloudBackupPasswordMetadata(password: string) {
  return invoke<CloudBackupPasswordMetadata>("create_cloud_backup_password_metadata", { password });
}

export async function verifyCloudBackupPassword(
  password: string,
  metadata: Pick<CloudBackupPasswordMetadata, "salt" | "verifier">,
) {
  await invoke<void>("verify_cloud_backup_password", {
    password,
    salt: metadata.salt,
    verifier: metadata.verifier,
  });
}

export async function encryptCloudBackup(password: string, plaintextJson: string) {
  return invoke<EncryptedCloudBackup>("encrypt_cloud_backup", { password, plaintextJson });
}

export async function decryptCloudBackup(password: string, backupPackage: EncryptedCloudBackup) {
  return invoke<string>("decrypt_cloud_backup", { password, package: backupPackage });
}
