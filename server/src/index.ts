import './config/env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { initializeDatabase } from './db/database.js';
import authRoutes from './routes/auth.js';
import analyticsRoutes from './routes/analytics.js';
import dataRoutes from './routes/data.js';
import aiRoutes from './routes/ai.js';
import integrationRoutes from './routes/integrations.js';
import learningRoutes from './routes/learning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

initializeDatabase();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/learning', learningRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', local: true });
});

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n  AiCoach Server running at http://localhost:${PORT}`);
  if (env.APP_URL && !env.APP_URL.includes('localhost')) {
    console.log(`  Public URL: ${env.APP_URL.replace(/\/$/, '')}`);
  }
  console.log(`  Network: http://<your-ip>:${PORT}`);
  console.log(`  Local-first student athlete OS`);
  console.log(`  Data stored locally in ./data/\n`);
});

export default app;
