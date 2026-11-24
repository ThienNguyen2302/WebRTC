import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInviteUrl, createRoom } from './rooms';

const response = {
  roomId: '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d',
  inviteSecret: 'a'.repeat(43),
  expiresAt: '2026-11-24T10:00:00.000Z',
};

describe('room API client', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates a room through the API and validates the response', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRoom()).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  });

  it('does not return a room when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));

    await expect(createRoom()).rejects.toThrow('ROOM_CREATE_FAILED');
  });

  it('rejects malformed or invalid API responses explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 201 })));

    await expect(createRoom()).rejects.toThrow('ROOM_CREATE_INVALID_RESPONSE');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ roomId: 'bad' }), { status: 201 })),
    );
    await expect(createRoom()).rejects.toThrow('ROOM_CREATE_INVALID_RESPONSE');
  });

  it('keeps the invite secret in the URL fragment instead of the query string', () => {
    expect(
      createInviteUrl(response.roomId, 'share_secret-123', 'https://call.example.test/'),
    ).toBe(`https://call.example.test/call/${response.roomId}#share_secret-123`);
  });
});
