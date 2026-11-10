import { z } from 'zod';

import { RoomErrorCodeSchema } from './room';

const base = {
  id: z.string().uuid(),
  roomId: z.string().uuid(),
};

const description = z
  .object({
    sdp: z.string().min(1),
  })
  .strict();

const candidate = z
  .object({
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().int().nullable(),
  })
  .strict();

const empty = z.object({}).strict();

export const ClientSignalSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...base,
      type: z.literal('offer'),
      payload: description,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('answer'),
      payload: description,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('iceCandidate'),
      payload: candidate,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('endCall'),
      payload: empty,
    })
    .strict(),
]);

export const ServerSignalSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('joined'),
      participantCredential: z.string(),
      offerer: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('peerJoined'),
    })
    .strict(),
  z
    .object({
      type: z.literal('peerRejoined'),
      offerer: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('signal'),
      message: ClientSignalSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('peerLeft'),
    })
    .strict(),
  z
    .object({
      type: z.literal('roomClosed'),
      reason: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('roomError'),
      code: RoomErrorCodeSchema,
    })
    .strict(),
]);

export const SignalAckSchema = z
  .object({
    messageId: z.string().uuid(),
    accepted: z.boolean(),
  })
  .strict();

export type ClientSignal = z.infer<typeof ClientSignalSchema>;
export type ServerSignal = z.infer<typeof ServerSignalSchema>;
export type SignalAck = z.infer<typeof SignalAckSchema>;
