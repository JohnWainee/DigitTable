import { act, render, screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { asCommandId, asMemberId, asRoomId, type MemberId } from "@digitable/contracts";
import { ORIGINAL_MISSION } from "@digitable/template-eat-the-reich";
import { App } from "../../src/App.js";
import { readOwnershipRecord, type LocalOwnershipRecord } from "../../src/session/ownership.js";
import { roomEngineStore } from "../../src/session/RoomEngineStore.js";

/**
 * Shared fixture-mode session drivers for the F-lane polish tests. Each
 * drives the real screens against `RoomEngineStore` (no Firebase config in
 * this test environment, so `roomClient.ts` stays in fixture mode), the
 * same approach `LandingFlow.a11y.test.tsx` and `PlayerDashboard.a11y.test.tsx`
 * use inline.
 */
export type User = ReturnType<typeof userEvent.setup>;

export function setViewport(width: number, height: number): void {
  window.innerWidth = width;
  window.innerHeight = height;
}

export function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

export function renderApp(hash = "#/"): ReturnType<typeof render> {
  window.location.hash = hash;
  return render(<App />);
}

export interface GmSession {
  readonly roomId: string;
  readonly roomCode: string;
  readonly tableCode: string;
  readonly gmOwnership: LocalOwnershipRecord;
}

/** Creates a session as the GM and stops on the Invite panel (before the console). */
export async function createSessionAsGm(user: User, passphrase = "wolfbane"): Promise<GmSession> {
  renderApp("#/create");
  await user.type(screen.getByLabelText(/session name/i), "Rooftop Drop");
  await user.type(screen.getByLabelText(/^passphrase$/i), passphrase);
  await user.type(screen.getByLabelText(/your display name/i), "Nadia");
  await user.click(screen.getByRole("button", { name: /^create session$/i }));
  await screen.findByRole("heading", { name: /write these down/i });
  const roomCode = screen.getByText(/^room code$/i).nextElementSibling!.textContent;
  const tableCode = screen.getByText(/^table code$/i).nextElementSibling!.textContent;
  await user.click(screen.getByLabelText(/i have written these down/i));
  await user.click(screen.getByRole("button", { name: /i'm ready — continue/i }));
  await screen.findByRole("heading", { name: /^invite$/i });
  const gmOwnership = readOwnershipRecord()!;
  return { roomId: gmOwnership.roomId, roomCode, tableCode, gmOwnership };
}

/** Joins as a new player identity (a "different browser") and stops on the claim screen. */
export async function joinAsPlayer(
  user: User,
  roomCode: string,
  displayName = "Rook's Player",
  passphrase = "wolfbane",
): Promise<LocalOwnershipRecord> {
  window.localStorage.clear();
  goTo("#/join");
  await user.type(screen.getByLabelText(/room code/i), roomCode);
  await user.type(screen.getByLabelText(/^passphrase$/i), passphrase);
  await user.type(screen.getByLabelText(/your display name/i), displayName);
  await user.click(screen.getByRole("button", { name: /^join session$/i }));
  await screen.findByRole("heading", { name: /your recovery code/i });
  await user.click(screen.getByRole("button", { name: /i wrote it down/i }));
  await screen.findByRole("heading", { name: /pick your character/i });
  return readOwnershipRecord()!;
}

/** Claims Iryna (the stable `rook` record) from the claim screen. */
export async function claimRook(user: User): Promise<void> {
  const rookCard = screen.getByRole("heading", { name: "Iryna" }).closest("li")!;
  await user.click(within(rookCard).getByRole("button", { name: /claim/i }));
  await within(rookCard).findByText(/^yours$/i);
}

/** Loads the opening scene through the room's own repository, as the GM. */
export async function loadOpeningSceneAsGm(roomId: string, gmMemberId: MemberId): Promise<void> {
  const repository = roomEngineStore.getRepository(asRoomId(roomId));
  if (!repository) throw new Error("room not found");
  const { gmBriefing: _gmBriefing, ...scene } = ORIGINAL_MISSION[0]!;
  await act(async () => {
    await repository.dispatch(gmMemberId, {
      commandId: asCommandId(crypto.randomUUID()),
      payload: { type: "LoadScene", ...scene },
    });
  });
}

/** Approves the named character's pending declared roll as the GM (no bonus claims, no engaged threats). */
export async function reviewAsGm(
  roomId: string,
  gmMemberId: string,
  characterId = "rook",
): Promise<void> {
  const repository = roomEngineStore.getRepository(asRoomId(roomId));
  if (!repository) throw new Error("room not found");
  const projection = await repository.getProjection({
    roomId: asRoomId(roomId),
    viewerId: asMemberId(gmMemberId),
    capability: "gm",
  });
  const pendingRoll = projection.view.rolls.find(
    (r) => r.characterId === characterId && r.status === "declared",
  );
  if (!pendingRoll) throw new Error("no pending declared roll for " + characterId);
  await act(async () => {
    await repository.dispatch(asMemberId(gmMemberId), {
      commandId: asCommandId(crypto.randomUUID()),
      payload: {
        type: "ReviewAction",
        rollId: pendingRoll.rollId,
        approvedClaimIds: [],
        engagedThreatIds: [],
      },
    });
  });
}
