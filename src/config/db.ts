import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.pg.host,
  port: env.pg.port,
  user: env.pg.user,
  password: env.pg.password,
  database: env.pg.database,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
