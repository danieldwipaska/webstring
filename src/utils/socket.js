import { io } from 'socket.io-client';

let socket = null;
const listeners = new Map();

export function initSocket(onStatusChange) {
  if (socket) return socket;

  // Auto-connect to current location (handled by Vite proxy in dev or Nginx in prod)
  socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[WebSocket Client] Connected to server.');
    if (onStatusChange) onStatusChange(true);
  });

  socket.on('disconnect', () => {
    console.log('[WebSocket Client] Disconnected.');
    if (onStatusChange) onStatusChange(false);
  });

  socket.on('metrics:update', (data) => {
    emitEvent('metrics:update', data);
  });

  socket.on('security:alert', (data) => {
    emitEvent('security:alert', data);
  });

  socket.on('logs:stream', (data) => {
    emitEvent('logs:stream', data);
  });

  return socket;
}

export function subscribeSocketEvent(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);

  return () => {
    const callbacks = listeners.get(event);
    if (callbacks) {
      listeners.set(
        event,
        callbacks.filter((cb) => cb !== callback)
      );
    }
  };
}

function emitEvent(event, data) {
  const callbacks = listeners.get(event);
  if (callbacks) {
    callbacks.forEach((cb) => cb(data));
  }
}
