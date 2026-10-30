import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pool, closePool } from '../config/db';

async function migrate(): Promise<void> {
  const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration complete: users, chats, chat_members ready.');
}

migrate()
  .catch((err: unknown) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
