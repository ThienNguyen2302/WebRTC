import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomsRepository } from './rooms.repository.js';
import { RoomExpiryScheduler } from './room-expiry.scheduler.js';

describe('RoomExpiryScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the current time to the repository', async () => {
    const now = new Date('2026-11-24T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const repository = {
      expireWaitingRooms: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const scheduler = new RoomExpiryScheduler(repository as RoomsRepository);

    await scheduler.expireWaitingRooms();

    expect(repository.expireWaitingRooms).toHaveBeenCalledWith(now);
  });

  it('propagates repository failures', async () => {
    const error = new Error('database unavailable');
    const repository = {
      expireWaitingRooms: vi.fn().mockRejectedValue(error),
    };
    const scheduler = new RoomExpiryScheduler(repository as RoomsRepository);

    await expect(scheduler.expireWaitingRooms()).rejects.toBe(error);
  });
});
