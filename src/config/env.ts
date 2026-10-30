import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: required('PGUSER'),
    password: String(process.env.PGPASSWORD ?? ''),
    database: required('PGDATABASE'),
  },
  firebase: {
    serviceAccountPath: required('FIREBASE_SERVICE_ACCOUNT_PATH'),
    projectId: process.env.FIREBASE_PROJECT_ID,
  },
} as const;
