import { getValidAccessToken } from "./googleDriveAuth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const MANIFEST_NAME = "lumo-backup-manifest.json";

export type DriveFile = {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
};

async function driveFetch<T>(url: string, init: RequestInit = {}) {
  const accessToken = await getValidAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(json?.error?.message || "Google Drive request failed.");
  }
  return json as T;
}

export async function listAppDataFiles(query = "") {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name,size,modifiedTime)",
    pageSize: "100",
  });
  if (query) params.set("q", query);
  const result = await driveFetch<{ files: DriveFile[] }>(`${DRIVE_API}/files?${params.toString()}`);
  return result.files ?? [];
}

export async function findAppDataFileByName(name: string) {
  const escapedName = name.replace(/'/g, "\\'");
  const files = await listAppDataFiles(`name='${escapedName}' and trashed=false`);
  return files[0] ?? null;
}

export async function uploadAppDataFile(name: string, content: Blob, mimeType: string) {
  const metadata = {
    name,
    parents: ["appDataFolder"],
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", content, name);
  return driveFetch<DriveFile>(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,modifiedTime`,
    {
      method: "POST",
      body: form,
    },
  );
}

export async function updateAppDataFile(fileId: string, content: Blob, mimeType: string) {
  return driveFetch<DriveFile>(
    `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media&fields=id,name,size,modifiedTime`,
    {
      method: "PATCH",
      headers: { "Content-Type": mimeType },
      body: content,
    },
  );
}

export async function upsertJsonAppDataFile(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const existing = await findAppDataFileByName(name);
  return existing
    ? updateAppDataFile(existing.id, blob, "application/json")
    : uploadAppDataFile(name, blob, "application/json");
}

export async function downloadAppDataFileText(fileId: string) {
  const accessToken = await getValidAccessToken();
  const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = "Google Drive download failed.";
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  return text;
}
