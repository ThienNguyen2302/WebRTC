import { CreateRoomButton } from '../components/create-room-button';

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero-card">
        <p className="eyebrow">One-to-one, peer-to-peer</p>
        <h1>Make a private video call</h1>
        <p className="hero-copy">
          Create a temporary room and share its invite link with one person. Your media stays
          between browsers.
        </p>
        <CreateRoomButton />
        <p className="privacy-note">Camera and microphone access is requested only when you join.</p>
      </section>
    </main>
  );
}
