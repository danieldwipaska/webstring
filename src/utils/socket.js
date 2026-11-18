import { io } from 'socket.io-client';

let socket = null;
let statusChangeHandler = null;
const listeners = new Map();

export function setSocketStatusHandler(handler) {
  statusChangeHandler = handler;
}

export function initSocket(onStatusChange) {
  if (onStatusChange) {
    statusChangeHandler = onStatusChange;
  }

  if (socket) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // Auto-connect to current location with HttpOnly cookie credentials
  socket = io({
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[WebSocket Client] Connected to server.');
    if (statusChangeHandler) statusChangeHandler(true);
  });

  socket.on('disconnect', () => {
    console.log('[WebSocket Client] Disconnected.');
    if (statusChangeHandler) statusChangeHandler(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WebSocket Client] Connection rejected or failed:', err.message);
    if (statusChangeHandler) statusChangeHandler(false);
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

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (statusChangeHandler) {
    statusChangeHandler(false);
  }
}

export function isSocketConnected() {
  return Boolean(socket && socket.connected);
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
