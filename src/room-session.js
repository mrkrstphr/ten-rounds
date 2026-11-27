export const roomStorageKey = code => `tenrounds.room.v1:${code}`;
const memory = new Map();
// getRandomValues also works on a trusted LAN HTTP origin, where randomUUID
// is unavailable. Use HTTPS for private play outside loopback.
export const roomRequestId = () => [...crypto.getRandomValues(new Uint8Array(16))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

export function readRoomCredentials(code) {
  if (memory.has(code)) return memory.get(code);
  try {
    const credentials = JSON.parse(sessionStorage.getItem(roomStorageKey(code)));
    if (credentials) memory.set(code, credentials);
    return credentials;
  } catch { return null; }
}

export function writeRoomCredentials(credentials) {
  memory.set(credentials.code, credentials);
  try { sessionStorage.setItem(roomStorageKey(credentials.code), JSON.stringify(credentials)); return true; }
  catch { return false; }
}
