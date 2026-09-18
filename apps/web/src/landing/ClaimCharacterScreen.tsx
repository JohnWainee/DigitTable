import { useState } from "react";
import { navigate } from "../router.js";
import { ConnectionStatusStrip } from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/ownership.js";
import { useRoomProjection } from "../session/useRoomProjection.js";
import { STATS } from "@digitable/template-eat-the-reich";
import { asCommandId } from "@digitable/contracts";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import { PortraitImage } from "../shared/PortraitImage.js";
import { Icon, STAT_ICON_NAMES, STAT_LABELS } from "../shared/Icon.js";

export interface ClaimCharacterScreenProps {
  readonly roomId: string;
}

/** docs/ETR_SESSION_FLOW.md section 4.3: `ClaimCharacterScreen`, derived from the real `roster` projection (C06). */
export function ClaimCharacterScreen({ roomId }: ClaimCharacterScreenProps): JSX.Element {
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const { status, projection, dispatch, pending, lastError } = useRoomProjection(
    roomId,
    memberId,
    "player",
  );
  const connection = status === "not-found" ? "signed-out" : status;
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(characterId: string, name: string): Promise<void> {
    if (!ownership || ownership.roomId !== roomId) return;
    setError(null);
    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), {
      type: "ClaimCharacter",
      characterId,
    });
    if (result.status === "accepted") {
      setAnnouncement(`You claimed ${name}.`);
    } else {
      setError(result.message);
      setAnnouncement(result.message);
    }
  }

  if (!ownership || ownership.roomId !== roomId) {
    return (
      <main className="landing-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">You need to join this session before picking a character.</p>
        <button type="button" className="primary-action" onClick={() => navigate("/join")}>
          Go to join
        </button>
      </main>
    );
  }

  if (status === "not-found") {
    return (
      <main className="landing-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">
          This session has ended, or fixture mode lost it on reload. Create or join a new one.
        </p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  const roster = projection?.view.roster ?? null;
  const mine = roster?.find((c) => c.claimedByMemberId === ownership.memberId);

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Pick your character</h1>
      <LiveRegion politeness="polite" message={announcement} />
      {pending && (
        <p role="status">
          Your action is awaiting confirmation. Reconnecting will check it automatically.
        </p>
      )}
      {(error || lastError) && (
        <p role="alert" className="error-message">
          {error ?? lastError?.message}
        </p>
      )}

      {roster === null ? (
        <p>Loading roster…</p>
      ) : (
        <ul className="roster-grid" aria-label="Roster">
          {roster.map((character) => {
            const isMine = character.id === mine?.id;
            const isTaken = character.claimedByMemberId !== null && !isMine;
            return (
              <li key={character.id} className="roster-card">
                <PortraitImage characterId={character.id} name={character.name} size="card" />
                <h2>{character.name}</h2>
                <p>{character.concept}</p>
                <ul className="stat-line" aria-label={`${character.name} stats`}>
                  {STATS.map((stat, i) => (
                    <li key={stat}>
                      <Icon name={STAT_ICON_NAMES[i]!} />
                      <span className="stat-label">{STAT_LABELS[i]}</span> {character.stats[stat]}
                    </li>
                  ))}
                </ul>
                {isMine ? (
                  <p className="roster-status roster-status--mine">Yours</p>
                ) : isTaken ? (
                  <p className="roster-status">Claimed</p>
                ) : (
                  <button
                    type="button"
                    className="primary-action"
                    disabled={pending || Boolean(mine)}
                    onClick={() => {
                      void handleClaim(character.id, character.name);
                    }}
                  >
                    Claim
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mine && (
        <button
          type="button"
          className="primary-action"
          onClick={() => navigate(`/room/${roomId}/player`)}
        >
          Continue to your dashboard
        </button>
      )}
    </main>
  );
}
