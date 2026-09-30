import express from 'express';
import type { Connection } from 'mongoose';

export function createApp(
  service: 'automation' | 'bank-demo',
  database: Connection,
  configure?: (app: express.Express) => void,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ service, status: 'ok', stage: 'foundation' });
  });
  app.get('/api/ready', (_request, response) => {
    const ready = database.readyState === 1;
    response.status(ready ? 200 : 503).json({
      service,
      status: ready ? 'ready' : 'not_ready',
      database: ready ? 'connected' : 'disconnected',
    });
  });
  configure?.(app);
  app.use((_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND' });
  });
  const errorHandler: express.ErrorRequestHandler = (_error, _request, response, _next) => {
    // Do not expose request values, stack traces, or connection strings.
    response.status(400).json({ code: 'INVALID_REQUEST' });
  };
  app.use(errorHandler);
  return app;
}
