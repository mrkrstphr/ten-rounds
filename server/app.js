import { createRequestHandler } from '@react-router/express';
import { RouterContextProvider } from 'react-router';
import { roomsContext, peerContext } from '../app/rooms-context.server.js';

export function createAppHandler(rooms) {
  return createRequestHandler({
    build: () => import('virtual:react-router/server-build'),
    getLoadContext: request => {
      const context = new RouterContextProvider();
      context.set(roomsContext, rooms);
      context.set(peerContext, request.socket.remoteAddress);
      return context;
    },
  });
}
