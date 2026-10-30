import { pool, closePool } from '../config/db';

// Inserts a couple of demo users so you can exercise the APIs right away.
async function seed(): Promise<void> {
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `INSERT INTO users (display_name)
     VALUES ('Alice'), ('Bob')
     RETURNING id, display_name`,
  );

  console.log('Seeded users:');
  for (const r of rows) {
    console.log(`  ${r.display_name} -> ${r.id}`);
  }
}

seed()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
