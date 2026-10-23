import { defineConfig } from 'vitest/config'

// India time: the team's timezone, and the one where a UTC timestamp falls on a different calendar day until 05:30.
export default defineConfig({ test: { env: { TZ: 'Asia/Kolkata' } } })
