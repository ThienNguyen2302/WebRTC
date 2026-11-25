import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientSignalSchema, type ClientSignal } from '@webrtc/contracts';

import { createPeerSession } from './peer-session';

const roomId = '2d9c6d8a-5c6c-48b8-b4fa-dc3ccdb88a2d';
const iceServers = [{ urls: ['stun:stun.example.test'] }];

type FakeTrack = {
  kind: 'audio' | 'video';
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
};

function makeTrack(kind: FakeTrack['kind']): FakeTrack {
  return { kind, enabled: true, stop: vi.fn() };
}

function makeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  } as unknown as MediaStream;
}

const events: string[] = [];

function makeSignalMock() {
  return vi.fn((signal: ClientSignal) => {
    ClientSignalSchema.parse(signal);
    events.push(`signal-${signal.type}`);
  });
}

function makeRemoteStreamMock() {
  return vi.fn((_stream: MediaStream) => undefined);
}

function makeConnectionStateMock() {
  return vi.fn((_state: RTCPeerConnectionState) => undefined);
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  readonly configuration: RTCConfiguration;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  addIceCandidate = vi.fn(async () => {
    events.push('candidate-added');
  });
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
    events.push('local-description');
  });
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
    events.push('remote-description');
  });

  constructor(configuration: RTCConfiguration) {
    this.configuration = configuration;
    FakePeerConnection.instances.push(this);
  }
}

const offerSignal: ClientSignal = {
  id: '0136542e-6cc0-42ec-9f2f-0929c080a96b',
  roomId,
  type: 'offer',
  payload: { sdp: 'remote-offer-sdp' },
};

const answerSignal: ClientSignal = {
  id: '58bfbd0c-54d8-46ae-80bf-235ec83f4ba4',
  roomId,
  type: 'answer',
  payload: { sdp: 'remote-answer-sdp' },
};

const candidateSignal: ClientSignal = {
  id: 'e20d8968-f209-46d8-8602-41d300f4a8f4',
  roomId,
  type: 'iceCandidate',
  payload: {
    candidate: 'candidate:1 1 UDP 1 192.0.2.1 5000 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  },
};

describe('browser peer session', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let onSignal: ReturnType<typeof makeSignalMock>;
  let onRemoteStream: ReturnType<typeof makeRemoteStreamMock>;
  let onConnectionStateChange: ReturnType<typeof makeConnectionStateMock>;

  beforeEach(() => {
    events.length = 0;
    FakePeerConnection.instances = [];
    getUserMedia = vi.fn();
    onSignal = makeSignalMock();
    onRemoteStream = makeRemoteStreamMock();
    onConnectionStateChange = makeConnectionStateMock();

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(iceServers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function makeOptions() {
    return { roomId, onSignal, onRemoteStream, onConnectionStateChange };
  }

  it('requests audio and video after media is available', async () => {
    const stream = makeStream([makeTrack('audio'), makeTrack('video')]);
    getUserMedia.mockResolvedValue(stream);

    const session = await createPeerSession(makeOptions());

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(session.localStream).toBe(stream);
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/ice-servers');
    expect(FakePeerConnection.instances[0]?.configuration).toEqual({ iceServers });
    expect(FakePeerConnection.instances[0]?.addTrack).toHaveBeenCalledTimes(2);
  });

  it('surfaces denied media permission without creating a peer connection', async () => {
    const permissionError = new Error('NotAllowedError');
    getUserMedia.mockRejectedValue(permissionError);

    await expect(createPeerSession(makeOptions())).rejects.toBe(permissionError);

    expect(FakePeerConnection.instances).toHaveLength(0);
  });

  it('reports unsupported media APIs before requesting permission', async () => {
    vi.stubGlobal('navigator', {});

    await expect(createPeerSession(makeOptions())).rejects.toThrow('MEDIA_UNAVAILABLE');
  });

  it('stops acquired tracks when peer construction fails', async () => {
    const audioTrack = makeTrack('audio');
    const stream = makeStream([audioTrack]);
    getUserMedia.mockResolvedValue(stream);
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        constructor() {
          throw new Error('PEER_SETUP_FAILED');
        }
      },
    );

    await expect(createPeerSession(makeOptions())).rejects.toThrow('PEER_SETUP_FAILED');

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('sets the local offer before signaling it', async () => {
    getUserMedia.mockResolvedValue(makeStream([]));
    const session = await createPeerSession(makeOptions());

    await session.startOffer();

    expect(events.indexOf('local-description')).toBeLessThan(events.indexOf('signal-offer'));
    expect(onSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId,
        type: 'offer',
        payload: { sdp: 'offer-sdp' },
      }),
    );
  });

  it('answers a remote offer after setting its remote description', async () => {
    getUserMedia.mockResolvedValue(makeStream([]));
    const session = await createPeerSession(makeOptions());

    await session.receive(offerSignal);

    expect(events.indexOf('remote-description')).toBeLessThan(
      events.indexOf('local-description'),
    );
    expect(events.indexOf('local-description')).toBeLessThan(events.indexOf('signal-answer'));
    expect(onSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId,
        type: 'answer',
        payload: { sdp: 'answer-sdp' },
      }),
    );
  });

  it('queues ICE candidates until the remote description is installed', async () => {
    getUserMedia.mockResolvedValue(makeStream([]));
    const session = await createPeerSession(makeOptions());
    const peerConnection = FakePeerConnection.instances[0];

    await session.receive(candidateSignal);

    expect(peerConnection?.addIceCandidate).not.toHaveBeenCalled();

    await session.receive(answerSignal);

    expect(events.indexOf('remote-description')).toBeLessThan(
      events.indexOf('candidate-added'),
    );
    expect(peerConnection?.addIceCandidate).toHaveBeenCalledWith(candidateSignal.payload);
  });

  it('toggles microphone and camera tracks without replacing them', async () => {
    const audioTrack = makeTrack('audio');
    const videoTrack = makeTrack('video');
    getUserMedia.mockResolvedValue(makeStream([audioTrack, videoTrack]));
    const session = await createPeerSession(makeOptions());

    session.setMicrophoneEnabled(false);
    session.setCameraEnabled(false);

    expect(audioTrack.enabled).toBe(false);
    expect(videoTrack.enabled).toBe(false);
    session.setMicrophoneEnabled(true);
    session.setCameraEnabled(true);
    expect(audioTrack.enabled).toBe(true);
    expect(videoTrack.enabled).toBe(true);
  });

  it('forwards remote streams and connection state changes', async () => {
    getUserMedia.mockResolvedValue(makeStream([]));
    const session = await createPeerSession(makeOptions());
    const peerConnection = FakePeerConnection.instances[0];
    const remoteStream = makeStream([]);

    const trackEvent = new Event('track') as RTCTrackEvent;
    Object.defineProperty(trackEvent, 'streams', { value: [remoteStream] });
    peerConnection?.ontrack?.(trackEvent);
    if (peerConnection) {
      peerConnection.connectionState = 'connected';
      peerConnection.onconnectionstatechange?.();
    }

    expect(onRemoteStream).toHaveBeenCalledWith(remoteStream);
    expect(onConnectionStateChange).toHaveBeenCalledWith('connected');
    await session.close();
  });

  it('closes resources only once and releases peer event handlers', async () => {
    const audioTrack = makeTrack('audio');
    getUserMedia.mockResolvedValue(makeStream([audioTrack]));
    const session = await createPeerSession(makeOptions());
    const peerConnection = FakePeerConnection.instances[0];

    await session.close();
    await session.close();

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection?.close).toHaveBeenCalledTimes(1);
    expect(peerConnection?.onicecandidate).toBeNull();
    expect(peerConnection?.ontrack).toBeNull();
    expect(peerConnection?.onconnectionstatechange).toBeNull();
  });

  it('stops media if the ICE configuration cannot be loaded', async () => {
    const audioTrack = makeTrack('audio');
    getUserMedia.mockResolvedValue(makeStream([audioTrack]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));

    await expect(createPeerSession(makeOptions())).rejects.toThrow('ICE_CONFIG_FAILED');

    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(FakePeerConnection.instances).toHaveLength(0);
  });
});
