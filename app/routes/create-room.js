import { roomsContext, peerContext } from '../rooms-context.server.js';
import { readCommand, privateData, apiError } from '../room-api.server.js';

export async function action({ request, context }) {
  const rooms = context.get(roomsContext);
  let command;
  try {
    rooms.limit(context.get(peerContext), 'rooms');
    command = await readCommand(request, rooms);
    const identity = command.type === 'create' ? rooms.store.create(command.name)
      : command.type === 'join' ? rooms.store.join(command.code, command.name) : null;
    if (!identity) throw Error('Choose create or join.');
    rooms.broadcast(identity.code);
    return privateData({ id: command.id, ok: true, credentials: { code: identity.code, token: identity.token } });
  } catch (error) { return apiError(error, command?.id); }
}
