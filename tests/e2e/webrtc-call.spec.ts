import { expect, test } from '@playwright/test';
import { CreateRoomResponseSchema } from '@webrtc/contracts';
import { PrismaClient } from '@prisma/client';

const inviteSecret = 'a'.repeat(43);

test('two browsers connect and end the temporary call', async ({ browser }) => {
  const caller = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  const guest = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  try {
    const callerPage = await caller.newPage();
    const guestPage = await guest.newPage();
    await callerPage.goto('/');
    await callerPage.getByRole('button', { name: 'Create a room' }).click();
    const inviteUrl = await callerPage.getByRole('link').getAttribute('href');
    if (!inviteUrl) {
      throw new Error('INVITE_LINK_MISSING');
    }

    await callerPage.goto(inviteUrl);
    await guestPage.goto(inviteUrl);
    await callerPage.getByRole('button', { name: 'Join call' }).click();
    await guestPage.getByRole('button', { name: 'Join call' }).click();
    await expect(callerPage.getByRole('status')).toHaveText('Connected');
    await expect(guestPage.getByRole('status')).toHaveText('Connected');
    await expect
      .poll(() =>
        callerPage
          .getByLabel('Other participant video')
          .evaluate((video: HTMLVideoElement) => video.videoWidth > 0),
      )
      .toBe(true);

    await callerPage.getByRole('button', { name: 'Mute microphone' }).click();
    await expect(callerPage.getByRole('button', { name: 'Unmute microphone' })).toBeVisible();
    await callerPage.getByRole('button', { name: 'Turn camera off' }).click();
    await expect(callerPage.getByRole('button', { name: 'Turn camera on' })).toBeVisible();

    await callerPage.getByRole('button', { name: 'End call' }).click();
    await expect(guestPage.getByRole('status')).toHaveText('Call ended');
  } finally {
    await caller.close();
    await guest.close();
  }
});

test('shows an actionable error for an invite with no secret fragment', async ({ page }) => {
  await page.goto('/call/2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d');

  await expect(page.getByRole('alert')).toContainText('invite link is incomplete');
});

test('shows an explicit room error for an unknown invite', async ({ page }) => {
  await page.goto(`/call/2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d#${inviteSecret}`);
  await page.getByRole('button', { name: 'Join call' }).click();

  await expect(page.getByRole('alert')).toContainText('could not be found');
});

test('rejects an invite after its waiting room expires', async ({ page, request }) => {
  const response = await request.post('http://127.0.0.1:3001/rooms', { data: {} });
  expect(response.ok()).toBe(true);
  const room = CreateRoomResponseSchema.parse(await response.json());
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.E2E_DATABASE_URL } },
  });
  try {
    await prisma.room.update({
      where: { id: room.roomId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto(`/call/${room.roomId}#${room.inviteSecret}`);
  await page.getByRole('button', { name: 'Join call' }).click();

  await expect(page.getByRole('alert')).toContainText('room has expired');
});

test('shows actionable feedback when camera and microphone permission is denied', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto(`/call/2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d#${inviteSecret}`);
  await page.getByRole('button', { name: 'Join call' }).click();

  await expect(page.getByRole('alert')).toContainText('access was denied');
});
