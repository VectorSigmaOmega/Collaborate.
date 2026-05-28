const CLIENT_ID_KEY = "collaborate.clientId";
const DISPLAY_NAME_KEY = "collaborate.displayName";
const IDENTITY_COLOR_KEY = "collaborate.identityColor";
const ACTIVE_ROOM_ID_KEY = "collaborate.activeRoomId";

export function getOrCreateClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_ID_KEY, generated);
  return generated;
}

export function getStoredDisplayName() {
  return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

export function storeDisplayName(displayName: string) {
  window.localStorage.setItem(DISPLAY_NAME_KEY, displayName);
}

export function getStoredIdentityColor(fallback: string) {
  return window.localStorage.getItem(IDENTITY_COLOR_KEY) ?? fallback;
}

export function storeIdentityColor(color: string) {
  window.localStorage.setItem(IDENTITY_COLOR_KEY, color);
}

export function getStoredActiveRoomId() {
  return window.localStorage.getItem(ACTIVE_ROOM_ID_KEY);
}

export function storeActiveRoomId(roomId: string) {
  window.localStorage.setItem(ACTIVE_ROOM_ID_KEY, roomId);
}

export function clearStoredActiveRoomId(roomId?: string) {
  if (roomId && getStoredActiveRoomId() !== roomId) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_ROOM_ID_KEY);
}

export function createRoomId() {
  return crypto.randomUUID();
}
