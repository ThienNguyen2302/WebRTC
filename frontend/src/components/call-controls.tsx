'use client';

type CallControlsProps = {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
};

export function CallControls({
  microphoneEnabled,
  cameraEnabled,
  onToggleMicrophone,
  onToggleCamera,
  onEndCall,
}: CallControlsProps) {
  return (
    <div aria-label="Call controls" className="call-controls">
      <button onClick={onToggleMicrophone} type="button">
        {microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
      </button>
      <button onClick={onToggleCamera} type="button">
        {cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
      </button>
      <button onClick={onEndCall} type="button">
        End call
      </button>
    </div>
  );
}
