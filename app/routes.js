import { index, route } from '@react-router/dev/routes';

export default [
  index('routes/table.jsx'),
  route('index.html', 'routes/legacy.jsx'),
  route('online', 'routes/online.jsx'),
  route('rooms/:code', 'routes/room.jsx'),
  route('api/rooms', 'routes/create-room.js'),
  route('api/rooms/:code', 'routes/room-state.js'),
  route('*', 'routes/not-found.jsx'),
];
