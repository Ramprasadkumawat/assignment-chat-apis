import express from 'express';
import { env } from './config/env';
import { chatRouter } from './routes/chat';
import { userRouter } from './routes/user';
import { errorHandler } from './middleware/errorHandler';
import { pool } from './config/db';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/chat', chatRouter);
app.use('/user', userRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`Chat backend listening on http://localhost:${env.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
