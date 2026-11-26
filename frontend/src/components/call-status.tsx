type CallStatusProps = {
  message: string;
  status:
    | 'loading'
    | 'ready'
    | 'joining'
    | 'requestingMedia'
    | 'waiting'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'ended'
    | 'error';
};

export function CallStatus({ message, status }: CallStatusProps) {
  return (
    <p
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      className={`call-status call-status-${status}`}
      role={status === 'error' ? 'alert' : 'status'}
    >
      {message}
    </p>
  );
}
