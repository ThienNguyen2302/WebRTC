'use client';

import { useState } from 'react';

import { createInviteUrl, createRoom } from '../lib/api/rooms';

export function CreateRoomButton() {
  const [isCreating, setIsCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCreateRoom(): Promise<void> {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      const room = await createRoom();
      setInviteUrl(createInviteUrl(room.roomId, room.inviteSecret, window.location.origin));
    } catch {
      setErrorMessage('Could not create a room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="room-actions">
      <button
        className="primary-button"
        disabled={isCreating}
        onClick={handleCreateRoom}
        type="button"
      >
        {isCreating ? 'Creating room...' : 'Create a room'}
      </button>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {inviteUrl ? (
        <section aria-label="Room invite" className="invite-panel">
          <h2>Your room is ready</h2>
          <p>Share this private invite link with one person:</p>
          <a href={inviteUrl}>{inviteUrl}</a>
        </section>
      ) : null}
    </div>
  );
}
