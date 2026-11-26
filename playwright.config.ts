import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: [
    {
      command:
        'node tests/e2e/check-postgres.mjs && npm run start:dev --workspace @webrtc/api',
      url: 'http://127.0.0.1:3001/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl ?? '',
        E2E_DATABASE_URL: databaseUrl ?? '',
        ICE_SERVERS_JSON: '[{"urls":["stun:stun.l.google.com:19302"]}]',
        PORT: '3001',
        ROOM_TTL_SECONDS: '1800',
        WEB_ORIGIN: 'http://127.0.0.1:3000',
      },
    },
    {
      command: 'npm run dev --workspace @webrtc/web -- --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3000/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
        NEXT_PUBLIC_SIGNALING_URL: 'http://127.0.0.1:3001',
      },
    },
  ],
});
