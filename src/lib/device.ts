// There is no login, so each browser names itself once ("櫃台", "倉庫"...)
// and that name rides along on every Supabase request (see client.ts). The
// database stamps it onto each change, so you can tell which computer did
// what. It lives in this browser's localStorage: another browser, private
// mode, or clearing site data on the same computer means naming it again.

const STORAGE_KEY = "jhdn_device_name";
export const DEVICE_NAME_EVENT = "jhdn-device-name-changed";
export const MAX_DEVICE_NAME_LENGTH = 20;

export function getDeviceName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDeviceName(name: string) {
  const trimmed = name.trim().slice(0, MAX_DEVICE_NAME_LENGTH);
  if (!trimmed) return;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // Storage blocked: the name just won't stick past this page load.
  }
  window.dispatchEvent(new Event(DEVICE_NAME_EVENT));
}

/** HTTP headers can't carry Chinese text directly, so send UTF-8 as base64. */
export function encodeDeviceHeader(name: string): string {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
