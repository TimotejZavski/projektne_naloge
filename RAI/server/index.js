/**
 * Vstopna tocka RAI backend streznika.
 *
 * Vrstni red:
 *   1. nalozimo env (validacija obveznih spremenljivk)
 *   2. povezava na MongoDB
 *   3. zazenemo Express app
 *   4. graceful shutdown na SIGINT/SIGTERM
 */

const env = require('./src/config/env');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const createApp = require('./src/app');

let server;

async function start() {
  try {
    await connectDatabase();
    const app = createApp();

    server = app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] RAI backend posluha na http://localhost:${env.PORT}`);
      console.log(`[server] NODE_ENV=${env.NODE_ENV}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[FATAL] Zagon strezniku ni uspel:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n[server] Prejet ${signal}, zaustavitev...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDatabase();
  // eslint-disable-next-line no-console
  console.log('[server] Cisto zaustavljen.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
  shutdown('unhandledRejection');
});

start();
