import { data } from 'react-router';

export const privateData = (value, status = 200, headers = {}) => data(value, {
  status, headers: { Vary: 'Authorization', ...headers },
});

export function apiError(error, id) {
  return privateData({ ok: false, id, error: error.code
    ? 'Could not save the room. Please try again.' : error instanceof SyntaxError ? 'Invalid request.' : error.message },
  error.status || 400, error.status === 413 ? { Connection: 'close' } : {});
}

export async function readCommand(request, rooms) {
  const url = new URL(request.url);
  if (!rooms.allowed(request.headers.get('origin'), url.host)) throw Error('Untrusted request origin.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Error('Send a JSON command.');
  const tooLarge = () => Object.assign(Error('This request is too large.'), { status: 413 });
  if (Number(request.headers.get('content-length')) > 8192) throw tooLarge();
  let bytes = 0;
  const chunks = [];
  const reader = request.body?.getReader();
  try {
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8192) throw tooLarge();
      chunks.push(value);
    }
  } finally {
    // Cancelling the Node-backed stream destroys the socket before a 413 can
    // reach the caller. The oversized response closes the connection instead.
    reader?.releaseLock();
  }
  const command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!command || typeof command.id !== 'string' || !/^[\w-]{1,64}$/.test(command.id)) throw Error('Invalid request.');
  return command;
}
