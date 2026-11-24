import { CallClient } from '../../../components/call-client';

type CallPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function CallPage({ params }: CallPageProps) {
  const { roomId } = await params;
  return <CallClient roomId={roomId} />;
}
