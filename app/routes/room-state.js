import { roomsContext, peerContext } from '../rooms-context.server.js';
import { readCommand, privateData, apiError } from '../room-api.server.js';

export function loader({ request, params, context }) {
  const rooms = context.get(roomsContext);
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const identity = rooms.store.authenticate(params.code, token);
    return privateData({ room: rooms.snapshot(identity.code, identity.index) });
  } catch (error) { return apiError(error); }
}

export async function action({ request, params, context }) {
  const rooms = context.get(roomsContext);
  let command;
  try {
    rooms.limit(context.get(peerContext), 'requests');
    command = await readCommand(request, rooms);
    const identity = rooms.store.authenticate(params.code, command.token);
    rooms.act(identity, command);
    return privateData({ id: command.id, ok: true });
  } catch (error) { return apiError(error, command?.id); }
}
