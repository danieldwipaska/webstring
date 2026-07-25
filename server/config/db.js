import mongoose from 'mongoose';

let isConnected = false;
let reconnectTimer = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ubuntu_monitor';

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true, // Ensure TTL indexes are created automatically
    });
    isConnected = true;
    console.log(`[MongoDB Sentinel] Connected successfully to ${mongoose.connection.host}/${mongoose.connection.name}`);
    
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  } catch (error) {
    isConnected = false;
    console.warn(`[MongoDB Warning] Could not connect to MongoDB Atlas / Local DB: ${error.message}`);
    console.warn(`[MongoDB Sentinel] Automatic background reconnection scheduled every 10 seconds...`);
    
    scheduleAutoReconnect(uri);
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('[MongoDB Sentinel] Reconnected to database.');
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[MongoDB Error] ${err.message}`);
    isConnected = false;
    scheduleAutoReconnect(uri);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn(`[MongoDB Sentinel] Connection lost. Retrying...`);
    isConnected = false;
    scheduleAutoReconnect(uri);
  });

  return isConnected;
}

function scheduleAutoReconnect(uri) {
  if (reconnectTimer || isConnected) return;

  reconnectTimer = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      isConnected = true;
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }

    try {
      console.log('[MongoDB Sentinel] Attempting background database reconnection...');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      isConnected = true;
      console.log('[MongoDB Sentinel] Reconnection successful!');
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    } catch (err) {
      isConnected = false;
    }
  }, 10000);
}

export function getDBStatus() {
  const state = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const connected = state === 1;
  return {
    isConnected: connected,
    readyState: state,
    host: connected ? mongoose.connection.host : 'Disconnected',
    name: connected ? mongoose.connection.name : 'N/A',
  };
}
