import { useState } from "react";
import type { EatTheReichView } from "@digitable/template-eat-the-reich";
import { OptionPicker } from "../shared/OptionPicker.js";

export interface GmCommunicationsProps {
  readonly roster: EatTheReichView["roster"];
  readonly onBroadcast: (text: string) => Promise<boolean>;
  readonly onPrivateMessage: (recipientMemberId: string, text: string) => Promise<boolean>;
}

export function GmCommunications({
  roster,
  onBroadcast,
  onPrivateMessage,
}: GmCommunicationsProps): JSX.Element {
  const [broadcast, setBroadcast] = useState("");
  const [privateText, setPrivateText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");
  const players = roster
    .filter((character) => character.claimedByMemberId !== null)
    .map((character) => ({ value: character.claimedByMemberId as string, label: character.name }));

  async function postBroadcast(): Promise<void> {
    if (await onBroadcast(broadcast)) {
      setBroadcast("");
      setStatus("Broadcast sent to the session.");
    }
  }

  async function sendPrivate(): Promise<void> {
    if (!recipient || !(await onPrivateMessage(recipient, privateText))) return;
    setPrivateText("");
    setStatus("Private note sent to that player.");
  }

  return (
    <section className="gm-communications" aria-labelledby="gm-communications-heading">
      <h2 id="gm-communications-heading">Session messages</h2>
      <p>
        Broadcasts appear for everyone, including the table display. Private notes go only to the
        selected player and GM.
      </p>
      <div className="message-compose">
        <label className="form-field" htmlFor="session-broadcast-text">
          <span>Broadcast to everyone</span>
          <textarea
            id="session-broadcast-text"
            value={broadcast}
            maxLength={500}
            rows={3}
            onChange={(event) => setBroadcast(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={!broadcast.trim()}
          onClick={() => void postBroadcast()}
        >
          Send broadcast
        </button>
      </div>
      <div className="message-compose">
        <OptionPicker
          id="private-message-recipient"
          label="Private note recipient"
          value={recipient}
          options={players}
          placeholder={players.length ? "Choose a player…" : "No players have joined yet"}
          onChange={setRecipient}
        />
        <label className="form-field" htmlFor="private-message-text">
          <span>Private note</span>
          <textarea
            id="private-message-text"
            value={privateText}
            maxLength={500}
            rows={3}
            onChange={(event) => setPrivateText(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-action"
          disabled={!recipient || !privateText.trim()}
          onClick={() => void sendPrivate()}
        >
          Send private note
        </button>
      </div>
      <p className="form-hint" aria-live="polite" role="status">
        {status}
      </p>
    </section>
  );
}
