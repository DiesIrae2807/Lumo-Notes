import { invoke } from "@tauri-apps/api/core";
import { clearRawSetting, getRawSetting, setRawSetting } from "./syncSettings";

const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SESSION_KEY = "sync.googleDriveSession";

type OAuthCodeResult = {
  code: string;
  redirectUri: string;
};

export type GoogleDriveSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  email: string | null;
  scope: string;
  tokenType: string;
};

function googleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
}

function googleClientSecret() {
  return import.meta.env.VITE_GOOGLE_CLIENT_SECRET?.trim() || "";
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64Url(new Uint8Array(digest));
}

function randomVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error_description || json?.error || "Google token request failed.");
  }
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

function parseJwtEmail(idToken?: string) {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export async function getStoredGoogleDriveSession() {
  const session = await getRawSetting<GoogleDriveSession | null>(SESSION_KEY);
  return session?.accessToken ? session : null;
}

export async function connectGoogleDrive() {
  const clientId = googleClientId();
  if (!clientId) {
    throw new Error("Set VITE_GOOGLE_CLIENT_ID before connecting Google Drive.");
  }

  const codeVerifier = randomVerifier();
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const result = await invoke<OAuthCodeResult>("google_oauth_authorize", {
    clientId,
    codeChallenge,
  });
  const token = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      ...(googleClientSecret() ? { client_secret: googleClientSecret() } : {}),
      code: result.code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: result.redirectUri,
    }),
  );

  if (!token.scope?.split(/\s+/).includes(DRIVE_APPDATA_SCOPE)) {
    throw new Error("Google did not grant Drive appDataFolder permission.");
  }

  const session: GoogleDriveSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 60) * 1000,
    email: parseJwtEmail(token.id_token),
    scope: token.scope,
    tokenType: token.token_type,
  };
  await setRawSetting(SESSION_KEY, session);
  return session;
}

export async function disconnectGoogleDrive() {
  await clearRawSetting(SESSION_KEY);
}

export async function getValidAccessToken() {
  const clientId = googleClientId();
  const session = await getStoredGoogleDriveSession();
  if (!session) throw new Error("Google Drive is not connected.");
  if (session.expiresAt > Date.now() + 30_000) return session.accessToken;
  if (!clientId || !session.refreshToken) {
    await disconnectGoogleDrive();
    throw new Error("Google Drive session expired. Reconnect Google Drive.");
  }

  const token = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      ...(googleClientSecret() ? { client_secret: googleClientSecret() } : {}),
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  );
  const nextSession: GoogleDriveSession = {
    ...session,
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 60) * 1000,
    scope: token.scope || session.scope,
    tokenType: token.token_type || session.tokenType,
  };
  await setRawSetting(SESSION_KEY, nextSession);
  return nextSession.accessToken;
}
