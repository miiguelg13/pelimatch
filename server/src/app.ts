import cors from 'cors';
import express from 'express';
import { api, errorHandler } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.get('/', (_req, res) => {
    res.type('text').send('Pelimatch API');
  });
  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
