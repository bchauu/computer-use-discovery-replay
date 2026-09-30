import mongoose from 'mongoose';
import { createApp } from './http.ts';
import type express from 'express';

export function startService(
  service: 'automation' | 'bank-demo',
  port: number,
  uri: string | undefined,
  configure?: (app: express.Express, database: mongoose.Connection) => void,
  cleanup?: () => Promise<void>,
) {
  const database = mongoose.createConnection();
  database.on('error', () => {
    console.error(JSON.stringify({ service, event: 'database_error' }));
  });
  const app = createApp(service, database, appInstance => configure?.(appInstance, database));
  const server = app.listen(port, '127.0.0.1', () => {
    console.info(JSON.stringify({ service, event: 'listening', port }));
  });
  server.on('error', () => {
    console.error(JSON.stringify({ service, event: 'listen_failed', port }));
    process.exitCode = 1;
    void database.close();
  });
  if (uri) {
    void database.openUri(uri, { serverSelectionTimeoutMS: 5000, bufferCommands: false })
      .then(() => console.info(JSON.stringify({ service, event: 'database_connected' })))
      .catch(() => console.error(JSON.stringify({ service, event: 'database_unavailable' })));
  } else {
    console.info(JSON.stringify({ service, event: 'database_not_configured' }));
  }
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    server.close(() => {
      void Promise.allSettled([database.close(), cleanup?.() ?? Promise.resolve()]).finally(() => { clearTimeout(deadline); });
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
