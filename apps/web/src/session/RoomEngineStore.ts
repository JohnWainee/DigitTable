import {
  asMemberId,
  asRoomId,
  type Capability,
  type CreateRoomAccepted,
  type CreateRoomInput,
  type CreateRoomResult,
  type JoinRoomInput,
  type JoinRoomResult,
  type MemberId,
  type RecoverSeatInput,
  type RoomId,
} from "@digitable/contracts";
import {
  generateRecoveryCode,
  hashSecret,
  verifySecret,
  type HashedSecret,
} from "@digitable/engine";
import { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";
import type { RecoverSeatResult } from "./FirebaseSessionClient.js";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(length: number): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

interface FixtureRoom {
  readonly roomId: RoomId;
  readonly roomCode: string;
  readonly tableCode: string;
  readonly sessionName: string;
  readonly passphraseHash: HashedSecret;
  readonly repository: InMemoryRoomRepository;
  readonly capabilitiesByMember: Map<MemberId, Capability>;
  readonly recoveryHashesByMember: Map<MemberId, HashedSecret>;
  tableClaimed: boolean;
  playerCount: number;
}

/**
 * C06 (issue #14): fixture mode's "server" — the in-memory stand-in for
 * `apps/functions`'s `createRoom`/`admitMember` callables
 * (`apps/functions/src/callables.ts`), reusing the *real* secret-hashing
 * primitive (`@digitable/engine`'s `hashSecret`/`verifySecret`,
 * PBKDF2/Web-Crypto — the same one the trusted server uses) instead of a
 * toy hash, and the real `InMemoryRoomRepository` (which runs the real
 * `eatTheReichTemplate` via `runCommand`/`projectViewer`) for every
 * post-membership command and projection. Unlike C01-C05's
 * `FixtureSessionGateway`, this issues no simulated roster/scene data of
 * its own — `ClaimCharacter`/`LoadScene`/etc. are real commands dispatched
 * through the real engine, exactly as they would be against
 * `FirebaseRoomRepository` in live mode. Still explicitly NOT real: no
 * network, no persistence past this tab's lifetime, no rate limiting.
 */
export class RoomEngineStore {
  private readonly roomsById = new Map<RoomId, FixtureRoom>();
  private readonly roomsByCode = new Map<string, FixtureRoom>();
  private readonly createReceipts = new Map<string, CreateRoomResult>();

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const existing = this.createReceipts.get(input.requestId);
    if (existing && existing.ok) {
      // Idempotent replay: secrets were shown once already (A03 semantics).
      return { ...existing, recoveryCode: null, tableCode: null };
    }
    if (input.sessionName.trim().length < 1 || input.sessionName.length > 60) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Session name must be 1-60 characters.",
      };
    }
    if (input.passphrase.length < 4 || input.passphrase.length > 128) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Passphrase must be 4-128 characters.",
      };
    }
    if (input.creatorDisplayName.trim().length < 1 || input.creatorDisplayName.length > 40) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Display name must be 1-40 characters.",
      };
    }

    const roomId = asRoomId(`fixture-${randomCode(10).toLowerCase()}`);
    const roomCode = randomCode(6);
    const tableCode = randomCode(6);
    const gmMemberId = asMemberId(`member-${randomCode(8).toLowerCase()}`);
    const passphraseHash = await hashSecret(input.passphrase);
    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await hashSecret(recoveryCode);

    const room: FixtureRoom = {
      roomId,
      roomCode,
      tableCode,
      sessionName: input.sessionName,
      passphraseHash,
      repository: new InMemoryRoomRepository(roomId, gmMemberId),
      capabilitiesByMember: new Map([[gmMemberId, "gm"]]),
      recoveryHashesByMember: new Map([[gmMemberId, recoveryHash]]),
      tableClaimed: false,
      playerCount: 0,
    };
    this.roomsById.set(roomId, room);
    this.roomsByCode.set(roomCode, room);

    const accepted: CreateRoomAccepted = {
      ok: true,
      roomId,
      roomCode,
      memberId: gmMemberId,
      capability: "gm",
      recoveryCode,
      roomRevision: 0,
      tableCode,
    };
    this.createReceipts.set(input.requestId, accepted);
    return accepted;
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    const room = this.roomsByCode.get(input.roomCode.toUpperCase());
    // apps/functions/src/admissionAuthority.ts: `table` admission checks a
    // *separate* secret (`admission/tableSecret`), never the room
    // passphrase — `input.passphrase` carries whichever secret this
    // `requestedCapability` actually needs (mirrors the real wire shape;
    // `FirebaseSessionClient` sends the same field either way).
    const secretOk =
      room !== undefined &&
      (input.requestedCapability === "table"
        ? input.passphrase.toUpperCase() === room.tableCode
        : await verifySecret(input.passphrase, room.passphraseHash));
    if (!room || !secretOk) {
      // Same message for a bad code and a bad passphrase/table-code (no oracle).
      return {
        ok: false,
        code: "INVALID_PASSPHRASE",
        message: "Code or passphrase not recognised.",
      };
    }
    if (input.requestedCapability === "player" && room.playerCount >= 6) {
      return { ok: false, code: "ROOM_FULL", message: "This session is full (8 seats)." };
    }
    if (input.requestedCapability === "table" && room.tableClaimed) {
      return { ok: false, code: "ROOM_FULL", message: "This room already has a shared display." };
    }
    const memberId = asMemberId(`member-${randomCode(8).toLowerCase()}`);
    room.repository.registerMember(memberId, input.requestedCapability);
    room.capabilitiesByMember.set(memberId, input.requestedCapability);
    if (input.requestedCapability === "player") room.playerCount += 1;
    if (input.requestedCapability === "table") room.tableClaimed = true;
    let recoveryCode: string | null = null;
    if (input.requestedCapability === "player") {
      recoveryCode = generateRecoveryCode();
      room.recoveryHashesByMember.set(memberId, await hashSecret(recoveryCode));
    }
    return {
      ok: true,
      roomId: room.roomId,
      roomCode: room.roomCode,
      memberId,
      capability: input.requestedCapability,
      recoveryCode,
      roomRevision: 0,
    };
  }

  async recoverSeat(input: RecoverSeatInput): Promise<RecoverSeatResult> {
    const room = this.roomsByCode.get(input.roomCode.toUpperCase());
    if (room) {
      for (const [memberId, hash] of room.recoveryHashesByMember) {
        if (!(await verifySecret(input.recoveryCode, hash))) continue;
        const capability = room.capabilitiesByMember.get(memberId);
        if (!capability) continue;
        const recoveryCode = generateRecoveryCode();
        room.recoveryHashesByMember.set(memberId, await hashSecret(recoveryCode));
        return { ok: true, roomId: room.roomId, memberId, capability, recoveryCode };
      }
    }
    return { ok: false, code: "INVALID_RECOVERY_CODE", message: "Code not recognised." };
  }

  getRepository(roomId: RoomId): InMemoryRoomRepository | null {
    return this.roomsById.get(roomId)?.repository ?? null;
  }

  roomExists(roomId: RoomId): boolean {
    return this.roomsById.has(roomId);
  }

  sessionNameFor(roomId: RoomId): string | null {
    return this.roomsById.get(roomId)?.sessionName ?? null;
  }

  /** GM invite panel: join count and table-display status (never the passphrase itself). */
  roomStats(
    roomId: RoomId,
  ): { readonly playerCount: number; readonly tableClaimed: boolean } | null {
    const room = this.roomsById.get(roomId);
    if (!room) return null;
    return { playerCount: room.playerCount, tableClaimed: room.tableClaimed };
  }
}

export type { Capability, MemberId };

export const roomEngineStore = new RoomEngineStore();
