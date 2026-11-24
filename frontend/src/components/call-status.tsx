type CallStatusProps = {
  message: string;
  status: 'loading' | 'ready' | 'error';
};

export function CallStatus({ message, status }: CallStatusProps) {
  return (
    <p className={`call-status call-status-${status}`} role={status === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  );
}
