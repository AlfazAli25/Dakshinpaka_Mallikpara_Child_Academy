require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { logError, logInfo } = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 30000);
const SERVER_KEEP_ALIVE_TIMEOUT_MS = Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || 65000);

const start = async () => {
  await connectDB();
  const server = http.createServer(app);
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS + 5000;

  server.listen(PORT, () => {
    logInfo('server_started', { port: PORT });
  });
};

start().catch((error) => {
  logError('server_start_failed', {
    message: error?.message || 'Unknown startup error'
  });
  process.exit(1);
});