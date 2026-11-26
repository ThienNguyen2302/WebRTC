'use client';

import { useEffect, useRef } from 'react';

type VideoStageProps = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
};

function useVideoStream(stream: MediaStream | null) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return videoRef;
}

export function VideoStage({ localStream, remoteStream }: VideoStageProps) {
  const localVideo = useVideoStream(localStream);
  const remoteVideo = useVideoStream(remoteStream);

  return (
    <section aria-label="Call video" className="video-stage">
      <div>
        <h2>You</h2>
        <video aria-label="Your video" autoPlay muted playsInline ref={localVideo} />
      </div>
      <div>
        <h2>Other participant</h2>
        <video aria-label="Other participant video" autoPlay playsInline ref={remoteVideo} />
      </div>
    </section>
  );
}
