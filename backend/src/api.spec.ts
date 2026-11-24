import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RoomsRepository } from './rooms/rooms.repository.js';

async function createApp(repository: object) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({ $connect: vi.fn(), $disconnect: vi.fn() })
    .overrideProvider(RoomsRepository)
    .useValue(repository)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

describe('HTTP API', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a room and returns its invite response', async () => {
    const repository = {
      create: vi.fn().mockImplementation(async (room) => room),
      closeAllActive: vi.fn(),
    };
    const app = await createApp(repository);

    try {
      const response = await request(app.getHttpServer()).post('/rooms').send({}).expect(201);

      expect(response.body).toEqual({
        roomId: expect.any(String),
        inviteSecret: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ inviteSecretHash: expect.any(String) }),
      );
    } finally {
      await app.close();
    }
  }, 15_000);

  it('rejects unknown room-creation fields', async () => {
    const app = await createApp({
      create: vi.fn(),
      closeAllActive: vi.fn(),
    });

    try {
      await request(app.getHttpServer()).post('/rooms').send({ unexpected: true }).expect(400);
    } finally {
      await app.close();
    }
  });

  it('returns validated runtime ICE server configuration', async () => {
    vi.stubEnv('ICE_SERVERS_JSON', '[{"urls":["stun:stun.example.test:3478"]}]');
    const app = await createApp({ closeAllActive: vi.fn() });

    try {
      await request(app.getHttpServer())
        .get('/ice-servers')
        .expect(200)
        .expect([{ urls: ['stun:stun.example.test:3478'] }]);
    } finally {
      await app.close();
    }
  });

  it('rejects malformed runtime ICE configuration', async () => {
    vi.stubEnv('ICE_SERVERS_JSON', '{"urls": "not-an-array"}');
    const app = await createApp({ closeAllActive: vi.fn() });

    try {
      await request(app.getHttpServer())
        .get('/ice-servers')
        .expect(500)
        .expect(({ body }) => expect(body.message).toBe('ICE_CONFIGURATION_INVALID'));
    } finally {
      await app.close();
    }
  });

  it('rejects syntactically invalid runtime ICE JSON', async () => {
    vi.stubEnv('ICE_SERVERS_JSON', 'not-json');
    const app = await createApp({ closeAllActive: vi.fn() });

    try {
      await request(app.getHttpServer())
        .get('/ice-servers')
        .expect(500)
        .expect(({ body }) => expect(body.message).toBe('ICE_CONFIGURATION_INVALID'));
    } finally {
      await app.close();
    }
  });

  it('returns a server error when room persistence fails', async () => {
    const app = await createApp({
      create: vi.fn().mockRejectedValue(new Error('database unavailable')),
      closeAllActive: vi.fn(),
    });

    try {
      const response = await request(app.getHttpServer()).post('/rooms').send({}).expect(500);
      expect(response.body).not.toHaveProperty('inviteSecret');
    } finally {
      await app.close();
    }
  });
});
