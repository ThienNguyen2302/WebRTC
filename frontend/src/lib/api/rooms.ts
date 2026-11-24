import {
  CreateRoomResponseSchema,
  type CreateRoomResponse,
} from '@webrtc/contracts';

export async function createRoom(): Promise<CreateRoomResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) {
    throw new Error('API_URL_NOT_CONFIGURED');
  }

  const response = await fetch(`${apiUrl}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error('ROOM_CREATE_FAILED');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('ROOM_CREATE_INVALID_RESPONSE');
  }

  const parsedResponse = CreateRoomResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new Error('ROOM_CREATE_INVALID_RESPONSE');
  }

  return parsedResponse.data;
}

export function createInviteUrl(roomId: string, inviteSecret: string, origin: string): string {
  const inviteUrl = new URL(`/call/${encodeURIComponent(roomId)}`, origin);
  inviteUrl.hash = encodeURIComponent(inviteSecret);
  return inviteUrl.toString();
}
