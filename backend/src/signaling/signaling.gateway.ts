import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  ClientSignalSchema,
  JoinRoomRequestSchema,
  SignalAckSchema,
  type ClientSignal,
  type RoomErrorCode,
  type ServerSignal,
  type SignalAck,
} from '@webrtc/contracts';

import { RoomServiceError, RoomsService } from '../rooms/rooms.service.js';
import {
  RoomPresence,
  type ParticipantSlot,
  type PresenceSocket,
  type RoomPresenceState,
} from './room-presence.js';

export type RoomSocket = PresenceSocket;
type SignalAckCallback = (ack: SignalAck) => void;

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  },
})
export class SignalingGateway implements OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(SignalingGateway.name);
  private readonly reconnectGraceMs: number;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly configService: ConfigService,
    private readonly presence: RoomPresence,
  ) {
    const graceSeconds = Number(
      this.configService.get<string | number>('RECONNECT_GRACE_SECONDS', 60),
    );
    if (!Number.isInteger(graceSeconds) || graceSeconds <= 0) {
      throw new Error('RECONNECT_GRACE_SECONDS must be a positive integer');
    }

    this.reconnectGraceMs = graceSeconds * 1000;
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @ConnectedSocket() client: RoomSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const parsedRequest = JoinRoomRequestSchema.safeParse(payload);
    if (!parsedRequest.success) {
      this.emitRoomError(client, 'INVALID_MESSAGE');
      return;
    }

    const request = parsedRequest.data;
    try {
      await this.roomsService.verifyInvite(request.roomId, request.inviteSecret);
    } catch (error) {
      if (!(error instanceof RoomServiceError)) {
        throw error;
      }

      this.emitRoomError(client, error.code);
      if (error.code === 'ROOM_EXPIRED') {
        this.cleanupPresence(request.roomId, 'ROOM_EXPIRED');
      }
      return;
    }

    const existingMembership = this.presence.findSocket(client.id);
    if (existingMembership) {
      const participant = existingMembership.state.participants[existingMembership.participantIndex];
      if (
        existingMembership.roomId !== request.roomId ||
        (request.participantCredential !== undefined &&
          request.participantCredential !== participant.credential)
      ) {
        this.emitRoomError(client, 'NOT_AUTHORIZED');
        return;
      }

      this.emitJoined(client, participant.credential, existingMembership.participantIndex === 0);
      return;
    }

    const state = this.presence.get(request.roomId);
    if (request.participantCredential !== undefined) {
      await this.reclaimParticipant(client, request.participantCredential, state);
      return;
    }

    const roomState = state ?? this.presence.create(request.roomId);
    if (roomState.participants.length >= 2 || roomState.closing) {
      this.emitRoomError(client, 'ROOM_FULL');
      return;
    }

    const participant: ParticipantSlot = {
      credential: randomBytes(32).toString('base64url'),
      socket: client,
      reconnectTimer: null,
      messageHashes: new Map(),
    };
    const participantIndex = roomState.participants.length;
    roomState.participants.push(participant);

    if (participantIndex === 1) {
      try {
        await this.roomsService.activateRoom(request.roomId);
      } catch (error) {
        this.presence.removeParticipant(request.roomId, participant);
        if (error instanceof RoomServiceError) {
          this.emitRoomError(client, error.code);
          return;
        }
        throw error;
      }
    }

    this.emitJoined(client, participant.credential, participantIndex === 0);
    if (participantIndex === 1) {
      roomState.participants[0].socket?.emit('peerJoined', { type: 'peerJoined' });
    }
  }

  @SubscribeMessage('signal')
  async signal(
    @ConnectedSocket() client: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack?: SignalAckCallback,
  ): Promise<void> {
    const messageId = this.getAckMessageId(payload);
    const parsedSignal = ClientSignalSchema.safeParse(payload);
    if (!parsedSignal.success) {
      this.rejectSignal(client, messageId, ack, 'INVALID_MESSAGE');
      return;
    }

    const signal = parsedSignal.data;
    const membership = this.presence.findSocket(client.id);
    if (!membership || membership.roomId !== signal.roomId) {
      this.rejectSignal(client, signal.id, ack, 'NOT_AUTHORIZED');
      return;
    }

    const participant = membership.state.participants[membership.participantIndex];
    if (membership.state.closing) {
      this.rejectSignal(client, signal.id, ack, 'ROOM_EXPIRED');
      return;
    }

    const signalHash = this.hashSignal(signal);
    const previousHash = participant.messageHashes.get(signal.id);
    if (previousHash !== undefined) {
      if (previousHash === signalHash) {
        this.sendAck(ack, signal.id, true);
      } else {
        this.rejectSignal(client, signal.id, ack, 'INVALID_MESSAGE');
      }
      return;
    }

    if (signal.type === 'endCall') {
      try {
        await this.closeAndNotify(signal.roomId, 'CALL_ENDED');
      } catch (error) {
        if (error instanceof RoomServiceError) {
          this.rejectSignal(client, signal.id, ack, error.code);
          return;
        }
        throw error;
      }

      this.sendAck(ack, signal.id, true);
      return;
    }

    const peer = membership.state.participants.find(
      (candidate, index) =>
        index !== membership.participantIndex && candidate.socket !== null,
    );
    if (!peer?.socket) {
      this.rejectSignal(client, signal.id, ack, 'NOT_AUTHORIZED');
      return;
    }

    participant.messageHashes.set(signal.id, signalHash);
    peer.socket.emit('signal', { type: 'signal', message: signal });
    this.sendAck(ack, signal.id, true);
  }

  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @ConnectedSocket() client: RoomSocket,
    @MessageBody() payload?: unknown,
  ): Promise<void> {
    if (payload !== undefined) {
      this.emitRoomError(client, 'INVALID_MESSAGE');
      return;
    }

    const membership = this.presence.findSocket(client.id);
    if (!membership) {
      this.emitRoomError(client, 'NOT_AUTHORIZED');
      return;
    }

    await this.closeAndNotify(membership.roomId, 'CALL_ENDED');
  }

  handleDisconnect(client: RoomSocket): void {
    const membership = this.presence.findSocket(client.id);
    if (!membership) {
      return;
    }

    const participant = membership.state.participants[membership.participantIndex];
    participant.socket = null;
    for (const peer of membership.state.participants) {
      if (peer !== participant) {
        peer.socket?.emit('peerLeft', { type: 'peerLeft' });
      }
    }

    participant.reconnectTimer = setTimeout(() => {
      participant.reconnectTimer = null;
      void this.closeAndNotify(membership.roomId, 'RECONNECT_TIMEOUT').catch((error: unknown) => {
        this.logger.error(
          'Failed to close signaling room after reconnect grace period',
          error instanceof Error ? error.name : 'Unknown error',
        );
      });
    }, this.reconnectGraceMs);
  }

  onModuleDestroy(): void {
    for (const [, state] of this.presence.values()) {
      this.clearReconnectTimers(state);
    }
    this.presence.clear();
  }

  private async reclaimParticipant(
    client: RoomSocket,
    credential: string,
    state: RoomPresenceState | undefined,
  ): Promise<void> {
    const participantIndex =
      state?.participants.findIndex((participant) => participant.credential === credential) ?? -1;
    if (state === undefined || participantIndex === -1) {
      this.emitRoomError(client, 'NOT_AUTHORIZED');
      return;
    }

    const participant = state.participants[participantIndex];
    if (participant.socket !== null || state.closing) {
      this.emitRoomError(client, 'NOT_AUTHORIZED');
      return;
    }

    if (participant.reconnectTimer !== null) {
      clearTimeout(participant.reconnectTimer);
      participant.reconnectTimer = null;
    }
    participant.socket = client;
    this.emitJoined(client, participant.credential, participantIndex === 0);

    for (const [index, peer] of state.participants.entries()) {
      if (index !== participantIndex) {
        peer.socket?.emit('peerRejoined', {
          type: 'peerRejoined',
          offerer: participantIndex === 0,
        });
      }
    }

  }

  private async closeAndNotify(roomId: string, reason: string): Promise<void> {
    const state = this.presence.get(roomId);
    if (!state || state.closing) {
      return;
    }

    state.closing = true;
    try {
      await this.roomsService.closeRoom(roomId, 'CLOSED');
    } catch (error) {
      state.closing = false;
      throw error;
    }

    this.clearReconnectTimers(state);
    this.presence.delete(roomId);
    this.emitRoomClosed(state, reason);
  }

  private cleanupPresence(roomId: string, reason: string): void {
    const state = this.presence.delete(roomId);
    if (!state) {
      return;
    }

    this.clearReconnectTimers(state);
    this.emitRoomClosed(state, reason);
  }

  private clearReconnectTimers(state: RoomPresenceState): void {
    for (const participant of state.participants) {
      if (participant.reconnectTimer !== null) {
        clearTimeout(participant.reconnectTimer);
        participant.reconnectTimer = null;
      }
    }
  }

  private emitRoomClosed(state: RoomPresenceState, reason: string): void {
    const signal: ServerSignal = { type: 'roomClosed', reason };
    for (const participant of state.participants) {
      participant.socket?.emit('roomClosed', signal);
    }
  }

  private emitJoined(client: RoomSocket, credential: string, offerer: boolean): void {
    const signal: ServerSignal = {
      type: 'joined',
      participantCredential: credential,
      offerer,
    };
    client.emit('joined', signal);
  }

  private emitRoomError(client: RoomSocket, code: RoomErrorCode): void {
    const signal: ServerSignal = { type: 'roomError', code };
    client.emit('roomError', signal);
  }

  private rejectSignal(
    client: RoomSocket,
    messageId: string,
    ack: SignalAckCallback | undefined,
    code: RoomErrorCode,
  ): void {
    this.emitRoomError(client, code);
    this.sendAck(ack, messageId, false);
  }

  private sendAck(ack: SignalAckCallback | undefined, messageId: string, accepted: boolean): void {
    if (ack) {
      ack(SignalAckSchema.parse({ messageId, accepted }));
    }
  }

  private getAckMessageId(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
      return randomUUID();
    }

    const result = SignalAckSchema.safeParse({
      messageId: payload.id,
      accepted: false,
    });
    return result.success ? result.data.messageId : randomUUID();
  }

  private hashSignal(signal: ClientSignal): string {
    return createHash('sha256').update(this.stableJson(signal)).digest('hex');
  }

  private stableJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error('Signal payload cannot be serialized');
      }
      return serialized;
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
      .join(',')}}`;
  }
}
