import {
  ClientSignalSchema,
  IceServerConfigSchema,
  type ClientSignal,
} from '@webrtc/contracts';

import { getLocalMedia } from './media';

export type NegotiationSignal = Extract<ClientSignal, { type: 'offer' | 'answer' | 'iceCandidate' }>;

export type PeerSessionOptions = {
  roomId: string;
  onSignal: (signal: ClientSignal) => void | Promise<void>;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
};

export type PeerSession = {
  localStream: MediaStream;
  startOffer(): Promise<void>;
  receive(signal: NegotiationSignal): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  setCameraEnabled(enabled: boolean): void;
  close(): void;
};

export async function createPeerSession(options: PeerSessionOptions): Promise<PeerSession> {
  const localStream = await getLocalMedia();

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
    if (!apiUrl) {
      throw new Error('API_URL_NOT_CONFIGURED');
    }

    const response = await fetch(`${apiUrl}/ice-servers`);
    if (!response.ok) {
      throw new Error('ICE_CONFIG_FAILED');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('ICE_CONFIG_INVALID');
    }

    const iceServers = IceServerConfigSchema.safeParse(payload);
    if (!iceServers.success) {
      throw new Error('ICE_CONFIG_INVALID');
    }

    const peerConnection = new RTCPeerConnection({ iceServers: iceServers.data });
    const queuedCandidates: RTCIceCandidateInit[] = [];
    let closed = false;

    for (const track of localStream.getTracks()) {
      peerConnection.addTrack(track, localStream);
    }

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || closed) {
        return;
      }

      const candidate = event.candidate.toJSON();
      const message: ClientSignal = {
        id: crypto.randomUUID(),
        roomId: options.roomId,
        type: 'iceCandidate',
        payload: {
          candidate: candidate.candidate ?? '',
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        },
      };
      void Promise.resolve(options.onSignal(ClientSignalSchema.parse(message))).catch(
        (error: unknown) => {
          options.onError(error instanceof Error ? error : new Error('SIGNALING_DELIVERY_FAILED'));
        },
      );
    };

    peerConnection.ontrack = (event) => {
      if (!closed && event.streams[0]) {
        options.onRemoteStream(event.streams[0]);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (!closed) {
        options.onConnectionStateChange(peerConnection.connectionState);
      }
    };

    async function sendDescription(type: 'offer' | 'answer'): Promise<void> {
      const description =
        type === 'offer'
          ? await peerConnection.createOffer()
          : await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(description);
      if (!peerConnection.localDescription?.sdp) {
        throw new Error('LOCAL_DESCRIPTION_UNAVAILABLE');
      }

      const message: ClientSignal = {
        id: crypto.randomUUID(),
        roomId: options.roomId,
        type,
        payload: { sdp: peerConnection.localDescription.sdp },
      };
      await options.onSignal(ClientSignalSchema.parse(message));
    }

    async function drainCandidates(): Promise<void> {
      while (queuedCandidates.length > 0) {
        const candidate = queuedCandidates.shift();
        if (candidate) {
          await peerConnection.addIceCandidate(candidate);
        }
      }
    }

    return {
      localStream,
      startOffer: () => sendDescription('offer'),
      async receive(signal) {
        if (closed) {
          return;
        }

        if (signal.type === 'iceCandidate') {
          const candidate = signal.payload;
          if (!peerConnection.remoteDescription) {
            queuedCandidates.push(candidate);
          } else {
            await peerConnection.addIceCandidate(candidate);
          }
          return;
        }

        await peerConnection.setRemoteDescription({
          type: signal.type,
          sdp: signal.payload.sdp,
        });
        await drainCandidates();
        if (signal.type === 'offer') {
          await sendDescription('answer');
        }
      },
      setMicrophoneEnabled(enabled) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = enabled;
        }
      },
      setCameraEnabled(enabled) {
        for (const track of localStream.getVideoTracks()) {
          track.enabled = enabled;
        }
      },
      close() {
        if (closed) {
          return;
        }

        closed = true;
        queuedCandidates.length = 0;
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        for (const track of localStream.getTracks()) {
          track.stop();
        }
      },
    };
  } catch (error) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
    throw error;
  }
}
