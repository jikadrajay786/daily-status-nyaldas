import { defineConfig } from 'vitest/config'

// Live-database suite: needs `supabase start` and the env vars checked at the top of each file.
export default defineConfig({
  test: {
    include: ['test-db/**/*.db.ts'],
    env: { TZ: 'Asia/Kolkata' },
    testTimeout: 20_000,
    fileParallelism: false
  }
})
