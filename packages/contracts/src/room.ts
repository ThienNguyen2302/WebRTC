import { z } from 'zod';

export const RoomErrorCodeSchema = z.enum([
  'ROOM_NOT_FOUND',
  'ROOM_EXPIRED',
  'ROOM_FULL',
  'NOT_AUTHORIZED',
  'INVALID_MESSAGE',
]);

export const CreateRoomResponseSchema = z
  .object({
    roomId: z.string().uuid(),
    inviteSecret: z.string().min(1),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const JoinRoomRequestSchema = z
  .object({
    roomId: z.string().uuid(),
    inviteSecret: z.string().min(43),
    participantCredential: z.string().optional(),
  })
  .strict();

export const IceServerConfigSchema = z.array(
  z
    .object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    })
    .strict(),
);

export type RoomErrorCode = z.infer<typeof RoomErrorCodeSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type IceServerConfig = z.infer<typeof IceServerConfigSchema>;
