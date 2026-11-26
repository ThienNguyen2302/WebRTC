import {
  ClientSignalSchema,
  ServerSignalSchema,
  SignalAckSchema,
  type ClientSignal,
  type JoinRoomRequest,
  type ServerSignal,
  type SignalAck,
} from '@webrtc/contracts';
import { io, type Socket } from 'socket.io-client';

type ServerEvent = ServerSignal['type'];
type ClientEvent = ServerEvent | 'connect' | 'disconnect' | 'connect_error' | 'error';
type EventHandler = (payload?: unknown) => void;

const serverEvents: ServerEvent[] = [
  'joined',
  'peerJoined',
  'peerRejoined',
  'signal',
  'peerLeft',
  'roomClosed',
  'roomError',
];
const transportEvents = new Set(['connect', 'disconnect', 'connect_error', 'error']);

export type SignalingClient = {
  on(event: ClientEvent, handler: EventHandler): () => void;
  connect(): Promise<void>;
  joinRoom(request: JoinRoomRequest): void;
  sendSignal(signal: ClientSignal): Promise<SignalAck>;
  leaveRoom(): void;
  disconnect(): void;
};

export function createSignalingClient(): SignalingClient {
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (!signalingUrl) {
    throw new Error('SIGNALING_URL_NOT_CONFIGURED');
  }

  const socket: Socket = io(signalingUrl, { autoConnect: false });
  const listeners = new Map<ClientEvent, Set<EventHandler>>();

  function notify(event: ClientEvent, payload?: unknown): void {
    for (const handler of listeners.get(event) ?? []) {
      handler(payload);
    }
  }

  function on(event: ClientEvent, handler: EventHandler): () => void {
    const handlers = listeners.get(event) ?? new Set<EventHandler>();
    handlers.add(handler);
    listeners.set(event, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        listeners.delete(event);
      }
    };
  }

  socket.onAny((event, payload: unknown) => {
    if (!serverEvents.includes(event as ServerEvent)) {
      if (!transportEvents.has(event)) {
        notify('error', new Error('SIGNALING_INVALID_MESSAGE'));
      }
      return;
    }

    const parsed = ServerSignalSchema.safeParse(payload);
    if (!parsed.success || parsed.data.type !== event) {
      notify('error', new Error('SIGNALING_INVALID_MESSAGE'));
      return;
    }
    notify(parsed.data.type, parsed.data);
  });
  socket.on('connect', () => notify('connect'));
  socket.on('disconnect', (reason) => notify('disconnect', reason));
  socket.on('connect_error', (error) => notify('connect_error', error));

  return {
    on,
    connect() {
      if (socket.connected) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const handleConnect = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error('SIGNALING_CONNECTION_FAILED'));
        };
        const cleanup = () => {
          socket.off('connect', handleConnect);
          socket.off('connect_error', handleError);
        };

        socket.once('connect', handleConnect);
        socket.once('connect_error', handleError);
        socket.connect();
      });
    },
    joinRoom(request) {
      socket.emit('joinRoom', request);
    },
    async sendSignal(signal) {
      const parsedSignal = ClientSignalSchema.safeParse(signal);
      if (!parsedSignal.success) {
        throw new Error('SIGNALING_INVALID_MESSAGE');
      }

      const retryDelays = [500, 1000, 1000];
      for (const delay of retryDelays) {
        const ack = await new Promise<unknown>((resolve) => {
          const timer = setTimeout(() => resolve(null), delay);
          socket.emit('signal', parsedSignal.data, (receivedAck: unknown) => {
            clearTimeout(timer);
            resolve(receivedAck);
          });
        });
        if (ack === null) {
          continue;
        }

        const parsedAck = SignalAckSchema.safeParse(ack);
        if (!parsedAck.success || parsedAck.data.messageId !== signal.id) {
          throw new Error('SIGNALING_INVALID_ACK');
        }
        if (!parsedAck.data.accepted) {
          throw new Error('SIGNALING_DELIVERY_REJECTED');
        }
        return parsedAck.data;
      }

      throw new Error('SIGNALING_DELIVERY_FAILED');
    },
    leaveRoom() {
      socket.emit('leaveRoom');
    },
    disconnect() {
      socket.disconnect();
      listeners.clear();
    },
  };
}
