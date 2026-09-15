import { ETR_ROSTER_FIXTURE, type RosterCharacterFixture } from "../../test/fixtures/etrTemp.js";

/**
 * TEMPORARY stand-in for A03 (`createRoom`)/A05 (`FirebaseRoomRepository`).
 *
 * There is no live backend yet: A02 has published the integration contract
 * (`packages/contracts/src/session.ts`, `origin/sonnet-a/a02` PR #15 —
 * `CreateRoomInput`, `JoinRoomInput`, `RoomAdmissionAccepted`,
 * `SessionOwnershipRecord`) but A03/A05 have not landed and that branch is
 * not yet merged into `main` (Sonnet C does not edit `packages/contracts`).
 * This gateway simulates the same request/response *shapes* A02 defines,
 * using the same field names, entirely in this browser tab's memory, so
 * C01's screens can be built and reviewed against the real contract before
 * a real server exists. Swap every call in this file for the real
 * `FirebaseRoomRepository`/callables once A05 lands (issue #14, C01).
 *
 * Per docs/ETR_SESSION_FLOW.md section 3: A03 has a documented gap — the
 * create result needs a `tableCode` slot alongside `recoveryCode`. This
 * fixture reveals one, non-null only on first acceptance, matching the
 * doc's proposed shape (`tableCode: string | null`).
 *
 * Explicitly NOT real: state lives in a module-level object and is lost on
 * page reload (a real room persists in Firestore); passphrase matching uses
 * a non-cryptographic hash (a real backend uses
 * `packages/engine/src/secretHash.ts`); there is no rate limiting, no
 * cross-tab sync, and no server-side authorization.
 */

export type FixtureCapability = "gm" | "player" | "table";

export interface CreateRoomInput {
  readonly requestId: string;
  readonly sessionName: string;
  readonly passphrase: string;
  readonly creatorDisplayName: string;
}

export interface JoinRoomInput {
  readonly requestId: string;
  readonly roomCode: string;
  readonly passphrase: string;
  readonly requestedCapability: "player";
  readonly displayName: string;
}

export interface JoinTableInput {
  readonly requestId: string;
  readonly roomCode: string;
  readonly tableCode: string;
}

/** Mirrors A02's `RoomAdmissionAccepted`, plus the A03-gap `tableCode` slot (see class doc). */
export interface RoomAdmissionAccepted {
  readonly ok: true;
  readonly roomId: string;
  readonly roomCode: string;
  readonly memberId: string;
  readonly capability: FixtureCapability;
  readonly recoveryCode: string | null;
  readonly tableCode: string | null;
  readonly roomRevision: number;
}

/** The one field the client already holds and the server never echoes back (docs/ETR_SESSION_FLOW.md section 3, step 3). */
export interface CreateRoomReveal {
  readonly accepted: RoomAdmissionAccepted;
  readonly passphraseTyped: string;
  readonly repeated: boolean;
}

export interface RosterEntry extends RosterCharacterFixture {
  readonly claimedBy: string | null;
  readonly claimedByDisplayName: string | null;
  readonly revision: number;
}

export type FixtureGatewayErrorCode =
  | "ROOM_NOT_FOUND"
  | "INVALID_PASSPHRASE"
  | "ROOM_FULL"
  | "CHARACTER_TAKEN"
  | "REVISION_CONFLICT"
  | "INVALID_REQUEST";

export class FixtureGatewayError extends Error {
  constructor(
    readonly code: FixtureGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FixtureGatewayError";
  }
}

interface FixtureRoom {
  readonly roomId: string;
  readonly sessionName: string;
  readonly passphraseHash: string;
  readonly roomCode: string;
  readonly tableCode: string;
  readonly gmMemberId: string;
  readonly members: Map<string, { displayName: string; capability: FixtureCapability }>;
  readonly roster: Map<string, { claimedBy: string | null; revision: number }>;
  roomRevision: number;
  tableClaimed: boolean;
}

/** Never stores or logs the plaintext passphrase/recovery code; only this. */
function nonCryptoHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function randomCode(length: number): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // matches packages/engine's recovery alphabet
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function microtaskDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const OWNERSHIP_STORAGE_KEY = "digitable.etr.fixtureOwnership.v1";

/** Mirrors A02's `SessionOwnershipRecord` (packages/contracts/src/session.ts). */
export interface SessionOwnershipRecord {
  readonly roomId: string;
  readonly roomCode: string;
  readonly memberId: string;
  readonly capability: FixtureCapability;
  readonly recoveryCode: string | null;
  /** Not part of A02's shape; kept locally so the resume card can say who/where. */
  readonly displayName: string;
  readonly sessionName: string;
}

/**
 * Simulated single-process "server". A fresh instance per page load — this
 * is deliberate (see class doc): fixture mode keeps no state across reload,
 * matching `InMemoryRoomRepository`'s own documented lifetime.
 */
export class FixtureSessionGateway {
  private readonly roomsByCode = new Map<string, FixtureRoom>();
  private readonly roomsById = new Map<string, FixtureRoom>();
  private readonly createReceipts = new Map<string, CreateRoomReveal>();

  async createRoom(input: CreateRoomInput): Promise<CreateRoomReveal> {
    await microtaskDelay();
    const existing = this.createReceipts.get(input.requestId);
    if (existing) {
      return {
        ...existing,
        repeated: true,
        accepted: { ...existing.accepted, recoveryCode: null, tableCode: null },
      };
    }
    if (input.sessionName.trim().length < 1 || input.sessionName.length > 60) {
      throw new FixtureGatewayError("INVALID_REQUEST", "Session name must be 1-60 characters.");
    }
    if (input.passphrase.length < 4 || input.passphrase.length > 128) {
      throw new FixtureGatewayError("INVALID_REQUEST", "Passphrase must be 4-128 characters.");
    }
    if (input.creatorDisplayName.trim().length < 1 || input.creatorDisplayName.length > 40) {
      throw new FixtureGatewayError("INVALID_REQUEST", "Display name must be 1-40 characters.");
    }
    const roomId = `fixture-${randomCode(8).toLowerCase()}`;
    const roomCode = randomCode(6);
    const tableCode = randomCode(6);
    const gmMemberId = `member-${randomCode(6).toLowerCase()}`;
    const gmRecoveryCode = randomCode(13);

    const roster = new Map(
      ETR_ROSTER_FIXTURE.map((character) => [character.id, { claimedBy: null, revision: 0 }]),
    );

    const room: FixtureRoom = {
      roomId,
      sessionName: input.sessionName,
      passphraseHash: nonCryptoHash(input.passphrase),
      roomCode,
      tableCode,
      gmMemberId,
      members: new Map([[gmMemberId, { displayName: input.creatorDisplayName, capability: "gm" }]]),
      roster,
      roomRevision: 0,
      tableClaimed: false,
    };
    this.roomsByCode.set(roomCode, room);
    this.roomsById.set(roomId, room);
    this.passphraseHints.set(roomId, {
      firstChar: input.passphrase[0] ?? "",
      length: input.passphrase.length,
    });

    const reveal: CreateRoomReveal = {
      accepted: {
        ok: true,
        roomId,
        roomCode,
        memberId: gmMemberId,
        capability: "gm",
        recoveryCode: gmRecoveryCode,
        tableCode,
        roomRevision: 0,
      },
      passphraseTyped: input.passphrase,
      repeated: false,
    };
    this.createReceipts.set(input.requestId, reveal);
    return reveal;
  }

  async joinRoom(input: JoinRoomInput): Promise<RoomAdmissionAccepted> {
    await microtaskDelay();
    const room = this.roomsByCode.get(input.roomCode.toUpperCase());
    if (!room || room.passphraseHash !== nonCryptoHash(input.passphrase)) {
      // Same message for both cases so a wrong guess can't distinguish a bad
      // code from a bad passphrase (docs/ETR_SESSION_FLOW.md section 4.2).
      throw new FixtureGatewayError("INVALID_PASSPHRASE", "Code or passphrase not recognised.");
    }
    const seatCount = [...room.members.values()].filter((m) => m.capability === "player").length;
    if (seatCount >= 6) {
      throw new FixtureGatewayError("ROOM_FULL", "This session is full (8 seats).");
    }
    const memberId = `member-${randomCode(6).toLowerCase()}`;
    const recoveryCode = randomCode(13);
    room.members.set(memberId, { displayName: input.displayName, capability: "player" });
    return {
      ok: true,
      roomId: room.roomId,
      roomCode: room.roomCode,
      memberId,
      capability: "player",
      recoveryCode,
      tableCode: null,
      roomRevision: room.roomRevision,
    };
  }

  async joinTable(input: JoinTableInput): Promise<RoomAdmissionAccepted> {
    await microtaskDelay();
    const room = this.roomsByCode.get(input.roomCode.toUpperCase());
    if (!room || room.tableCode !== input.tableCode.toUpperCase()) {
      throw new FixtureGatewayError("INVALID_PASSPHRASE", "Code or passphrase not recognised.");
    }
    if (room.tableClaimed) {
      throw new FixtureGatewayError("ROOM_FULL", "This room already has a shared display.");
    }
    const memberId = `table-${randomCode(6).toLowerCase()}`;
    room.members.set(memberId, { displayName: "Table", capability: "table" });
    room.tableClaimed = true;
    return {
      ok: true,
      roomId: room.roomId,
      roomCode: room.roomCode,
      memberId,
      capability: "table",
      recoveryCode: null,
      tableCode: null,
      roomRevision: room.roomRevision,
    };
  }

  listRoster(roomId: string): readonly RosterEntry[] {
    const room = this.roomsById.get(roomId);
    if (!room) throw new FixtureGatewayError("ROOM_NOT_FOUND", "This session has ended.");
    return ETR_ROSTER_FIXTURE.map((character) => {
      const state = room.roster.get(character.id)!;
      const claimedMember = state.claimedBy ? room.members.get(state.claimedBy) : undefined;
      return {
        ...character,
        claimedBy: state.claimedBy,
        claimedByDisplayName: claimedMember?.displayName ?? null,
        revision: state.revision,
      };
    });
  }

  async claimCharacter(
    roomId: string,
    memberId: string,
    characterId: string,
    expectedRevision: number,
  ): Promise<void> {
    await microtaskDelay();
    const room = this.roomsById.get(roomId);
    if (!room) throw new FixtureGatewayError("ROOM_NOT_FOUND", "This session has ended.");
    const state = room.roster.get(characterId);
    if (!state) throw new FixtureGatewayError("INVALID_REQUEST", "Unknown character.");
    if (state.revision !== expectedRevision) {
      throw new FixtureGatewayError(
        "REVISION_CONFLICT",
        "Things changed while you decided. Take another look.",
      );
    }
    if (state.claimedBy && state.claimedBy !== memberId) {
      throw new FixtureGatewayError(
        "CHARACTER_TAKEN",
        `${room.members.get(state.claimedBy)?.displayName ?? "Someone"} was just claimed by someone else.`,
      );
    }
    // release any character this member already held (one character per member)
    for (const [id, s] of room.roster) {
      if (s.claimedBy === memberId && id !== characterId) {
        room.roster.set(id, { claimedBy: null, revision: s.revision + 1 });
      }
    }
    room.roster.set(characterId, { claimedBy: memberId, revision: state.revision + 1 });
  }

  sessionNameFor(roomId: string): string | null {
    return this.roomsById.get(roomId)?.sessionName ?? null;
  }

  roomExists(roomId: string): boolean {
    return this.roomsById.has(roomId);
  }

  memberDisplayName(roomId: string, memberId: string): string | null {
    return this.roomsById.get(roomId)?.members.get(memberId)?.displayName ?? null;
  }

  /** For the GM invite panel: join count `n/8` and whether the table seat is taken. */
  roomStats(
    roomId: string,
  ): { readonly playerCount: number; readonly tableClaimed: boolean } | null {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    return {
      playerCount: [...room.members.values()].filter((m) => m.capability === "player").length,
      tableClaimed: room.tableClaimed,
    };
  }

  /** "Show passphrase hint": first character and length only, never the full passphrase (docs/ETR_SESSION_FLOW.md section 4.1). */
  passphraseHint(roomId: string): { readonly firstChar: string; readonly length: number } | null {
    return this.passphraseHints.get(roomId) ?? null;
  }

  private readonly passphraseHints = new Map<string, { firstChar: string; length: number }>();
}

/** Reads the locally-remembered seat, if any. Never contains a secret except the one-time recovery code, matching A02's `SessionOwnershipRecord`. */
export function readOwnershipRecord(): SessionOwnershipRecord | null {
  try {
    const raw = window.localStorage.getItem(OWNERSHIP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionOwnershipRecord) : null;
  } catch {
    return null;
  }
}

export function writeOwnershipRecord(record: SessionOwnershipRecord): void {
  try {
    window.localStorage.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private browsing, quota) — resume simply won't be offered.
  }
}

export function clearOwnershipRecord(): void {
  try {
    window.localStorage.removeItem(OWNERSHIP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const CREATE_REQUEST_ID_KEY = "digitable.etr.fixtureCreateRequestId.v1";

/** One `requestId` per pending create-session form instance (docs/ETR_SESSION_FLOW.md section 3, step 1). */
export function getOrMintCreateRequestId(): string {
  try {
    const existing = window.sessionStorage.getItem(CREATE_REQUEST_ID_KEY);
    if (existing) return existing;
    const minted = globalThis.crypto.randomUUID();
    window.sessionStorage.setItem(CREATE_REQUEST_ID_KEY, minted);
    return minted;
  } catch {
    return globalThis.crypto.randomUUID();
  }
}

export function clearCreateRequestId(): void {
  try {
    window.sessionStorage.removeItem(CREATE_REQUEST_ID_KEY);
  } catch {
    // ignore
  }
}
