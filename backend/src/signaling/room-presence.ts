import type { ServerSignal } from '@webrtc/contracts';

export interface PresenceSocket {
  id: string;
  emit(event: ServerSignal['type'], payload: ServerSignal): unknown;
}

export interface ParticipantSlot {
  credential: string;
  socket: PresenceSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  messageHashes: Map<string, string>;
}

export interface RoomPresenceState {
  participants: ParticipantSlot[];
  closing: boolean;
}

export class RoomPresence {
  private readonly rooms = new Map<string, RoomPresenceState>();

  get(roomId: string): RoomPresenceState | undefined {
    return this.rooms.get(roomId);
  }

  create(roomId: string): RoomPresenceState {
    const state: RoomPresenceState = { participants: [], closing: false };
    this.rooms.set(roomId, state);
    return state;
  }

  findSocket(socketId: string):
    | { roomId: string; state: RoomPresenceState; participantIndex: number }
    | undefined {
    for (const [roomId, state] of this.rooms) {
      const participantIndex = state.participants.findIndex(
        (participant) => participant.socket?.id === socketId,
      );
      if (participantIndex !== -1) {
        return { roomId, state, participantIndex };
      }
    }

    return undefined;
  }

  removeParticipant(roomId: string, participant: ParticipantSlot): void {
    const state = this.rooms.get(roomId);
    if (!state) {
      return;
    }

    state.participants = state.participants.filter((item) => item !== participant);
    if (state.participants.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  delete(roomId: string): RoomPresenceState | undefined {
    const state = this.rooms.get(roomId);
    this.rooms.delete(roomId);
    return state;
  }

  values(): IterableIterator<[string, RoomPresenceState]> {
    return this.rooms.entries();
  }

  clear(): void {
    this.rooms.clear();
  }
}
