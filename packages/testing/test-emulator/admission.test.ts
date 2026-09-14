import type { RulesTestContext, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { hashSecret } from "@digitable/engine";
import {
  MAX_PARTICIPANT_SEATS,
  type AdmitMemberInput,
  type ClaimSeatInput,
} from "@digitable/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admitMember,
  claimSeat,
  type AdmissionResult,
  type Firestore,
} from "../src/admissionAuthority.js";
import { createEmulatorTestEnvironment } from "../src/emulator.js";

const PASSPHRASE = "correct horse battery staple";

/**
 * Phase 2 PR 3's admission-authority proof: the transaction shape a real
 * trusted Function (PR 4+) will host, exercised here against the emulator's
 * trusted context exactly as Phase 2 PR 2 exercised rules without a real
 * Function.
 */
describe("Phase 2 admission authority", () => {
  let testEnv: RulesTestEnvironment;
  let roomCounter = 0;

  beforeAll(async () => {
    testEnv = await createEmulatorTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  /** Seeds a fresh, isolated room with an open GM seat and a known passphrase. */
  async function seedRoom(
    db: Firestore,
    overrides: {
      readonly admissionStatus?: "open" | "closed";
      readonly participantCount?: number;
      readonly tableSeatClaimed?: boolean;
      readonly gmMemberId?: string | null;
      readonly roomStatus?: "active" | "archived";
    } = {},
  ): Promise<{ readonly roomId: string; readonly roomCode: string }> {
    roomCounter += 1;
    // Prefixed distinctly from other emulator test files' fixture room IDs/codes
    // (e.g. roomRules.test.ts's "room-1"/"CODE-1") — all Phase 2 emulator test
    // files share one running emulator instance, so colliding document paths
    // (`roomCodes/{code}`) would leak one file's fixture data into another's.
    const roomId = `room-admission-authority-${roomCounter}`;
    const roomCode = `ADMISSION-AUTHORITY-CODE-${roomCounter}`;
    const hashed = await hashSecret(PASSPHRASE);

    await Promise.all([
      db.doc(`roomCodes/${roomCode}`).set({ roomId }),
      db.doc(`rooms/${roomId}/admission/secret`).set(hashed),
      db.doc(`rooms/${roomId}/authority/current`).set({
        roomStatus: overrides.roomStatus ?? "active",
        admissionStatus: overrides.admissionStatus ?? "open",
        participantCount: overrides.participantCount ?? 0,
        tableSeatClaimed: overrides.tableSeatClaimed ?? false,
        gmMemberId: overrides.gmMemberId ?? null,
      }),
      db.doc(`rooms/${roomId}/meta/current`).set({
        roomStatus: overrides.roomStatus ?? "active",
        gmMemberId: overrides.gmMemberId ?? null,
      }),
    ]);

    return { roomId, roomCode };
  }

  /**
   * `withSecurityRulesDisabled` only returns `Promise<void>` — every
   * assertion in a test must run inside this callback, since the Firestore
   * handle it hands out only bypasses rules for the callback's own
   * lifetime (the emulator's stand-in for a trusted service identity, per
   * this module's file-level doc comment).
   */
  async function withTrustedDb(run: (db: Firestore) => Promise<void>): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) =>
      run(context.firestore()),
    );
  }

  function admitInput(overrides: Partial<AdmitMemberInput> = {}): AdmitMemberInput {
    return {
      roomCode: "unset",
      passphrase: PASSPHRASE,
      requestedCapability: "player",
      displayName: "Player",
      ...overrides,
    };
  }

  function claimInput(overrides: Partial<ClaimSeatInput> = {}): ClaimSeatInput {
    return { roomCode: "unset", passphrase: PASSPHRASE, displayName: "Director", ...overrides };
  }

  it("claims an empty GM seat and mints a one-time recovery code", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db);
      const result = await claimSeat(db, "uid-gm", claimInput({ roomCode }));
      expect(result.ok).toBe(true);
      const accepted = (result as Extract<AdmissionResult, { ok: true }>).accepted;
      expect(accepted.capability).toBe("gm");
      expect(accepted.recoveryCode).toEqual(expect.any(String));

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ gmMemberId: accepted.memberId, participantCount: 1 });
    });
  });

  it("admits a player and a table seat, each within their own capacity rule", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db, {
        participantCount: 1,
        gmMemberId: "member-gm",
      });

      const playerResult = await admitMember(db, "uid-player", admitInput({ roomCode }));
      expect(playerResult.ok).toBe(true);

      const tableResult = await admitMember(
        db,
        "uid-table",
        admitInput({ roomCode, requestedCapability: "table" }),
      );
      expect(tableResult.ok).toBe(true);

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ participantCount: 2, tableSeatClaimed: true });
    });
  });

  it("denies admission policy violations: unknown code and wrong passphrase", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode } = await seedRoom(db);

      const badCode = await admitMember(db, "uid-1", admitInput({ roomCode: "NO-SUCH-CODE" }));
      expect(badCode).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });

      const badPassphrase = await admitMember(
        db,
        "uid-2",
        admitInput({ roomCode, passphrase: "wrong phrase entirely" }),
      );
      expect(badPassphrase).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
    });
  });

  it("enforces the 8-participant capacity limit and the single table seat", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode } = await seedRoom(db, {
        participantCount: MAX_PARTICIPANT_SEATS - 1,
        gmMemberId: "member-gm",
      });

      const lastSeat = await admitMember(db, "uid-last-seat", admitInput({ roomCode }));
      expect(lastSeat.ok).toBe(true);

      const overCapacity = await admitMember(db, "uid-over-capacity", admitInput({ roomCode }));
      expect(overCapacity).toMatchObject({ ok: false, code: "ROOM_FULL" });

      const firstTable = await admitMember(
        db,
        "uid-table-1",
        admitInput({ roomCode, requestedCapability: "table" }),
      );
      expect(firstTable.ok).toBe(true);

      const secondTable = await admitMember(
        db,
        "uid-table-2",
        admitInput({ roomCode, requestedCapability: "table" }),
      );
      expect(secondTable).toMatchObject({ ok: false, code: "ROOM_FULL" });
    });
  });

  it("closes admission to new members but still lets a bound member reclaim their seat", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db, {
        participantCount: 1,
        gmMemberId: "member-gm",
      });
      const admitted = await admitMember(db, "uid-existing", admitInput({ roomCode }));
      expect(admitted.ok).toBe(true);

      await db.doc(`rooms/${roomId}/authority/current`).update({ admissionStatus: "closed" });

      const newcomerDenied = await admitMember(db, "uid-newcomer", admitInput({ roomCode }));
      expect(newcomerDenied).toMatchObject({ ok: false, code: "ADMISSION_CLOSED" });

      const reclaim = await admitMember(db, "uid-existing", admitInput({ roomCode }));
      expect(reclaim.ok).toBe(true);
      const reclaimed = (reclaim as Extract<AdmissionResult, { ok: true }>).accepted;
      expect(reclaimed.memberId).toBe(
        (admitted as Extract<AdmissionResult, { ok: true }>).accepted.memberId,
      );
      // Reconnecting never re-mints or re-exposes a recovery credential.
      expect(reclaimed.recoveryCode).toBeNull();
    });
  });

  it("reclaiming does not double-count the participant cap", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db, {
        participantCount: 1,
        gmMemberId: "member-gm",
      });
      await admitMember(db, "uid-existing", admitInput({ roomCode }));
      await admitMember(db, "uid-existing", admitInput({ roomCode }));
      await admitMember(db, "uid-existing", admitInput({ roomCode }));

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority?.participantCount).toBe(2);
    });
  });

  it("privilege escalation: a bound player cannot be reinterpreted as a table seat", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode } = await seedRoom(db, { participantCount: 1, gmMemberId: "member-gm" });
      await admitMember(db, "uid-player", admitInput({ roomCode }));

      const escalation = await admitMember(
        db,
        "uid-player",
        admitInput({ roomCode, requestedCapability: "table" }),
      );
      expect(escalation).toMatchObject({ ok: false, code: "ROLE_FORBIDDEN" });
    });
  });

  it("privilege escalation: a bound player cannot claim the GM seat via ClaimSeat", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode } = await seedRoom(db, { participantCount: 1, gmMemberId: "member-gm" });
      await admitMember(db, "uid-player", admitInput({ roomCode }));

      const escalation = await claimSeat(db, "uid-player", claimInput({ roomCode }));
      expect(escalation).toMatchObject({ ok: false, code: "ROLE_FORBIDDEN" });
    });
  });

  it("denies a second GM claim once the seat is taken (GM-seat exclusivity)", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode } = await seedRoom(db);
      const first = await claimSeat(db, "uid-gm-1", claimInput({ roomCode }));
      expect(first.ok).toBe(true);

      const second = await claimSeat(db, "uid-gm-2", claimInput({ roomCode }));
      expect(second).toMatchObject({ ok: false, code: "GM_SEAT_TAKEN" });
    });
  });

  it("GM-seat transaction race: exactly one of many concurrent claimants wins", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db);
      const claimantCount = 6;

      const results = await Promise.all(
        Array.from({ length: claimantCount }, (_, index) =>
          claimSeat(db, `uid-race-${index}`, claimInput({ roomCode })),
        ),
      );

      const winners = results.filter((result) => result.ok);
      const losers = results.filter((result) => !result.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(claimantCount - 1);
      for (const loser of losers) {
        expect(loser).toMatchObject({ code: "GM_SEAT_TAKEN" });
      }

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority?.participantCount).toBe(1);
      expect(authority?.gmMemberId).toBe(
        (winners[0] as Extract<AdmissionResult, { ok: true }>).accepted.memberId,
      );
    });
  });

  it("capacity race: concurrent admits never exceed the 8-participant cap", async () => {
    await withTrustedDb(async (db) => {
      const { roomCode, roomId } = await seedRoom(db, {
        participantCount: MAX_PARTICIPANT_SEATS - 2,
        gmMemberId: "member-gm",
      });
      const applicantCount = 5;

      const results = await Promise.all(
        Array.from({ length: applicantCount }, (_, index) =>
          admitMember(db, `uid-capacity-race-${index}`, admitInput({ roomCode })),
        ),
      );

      const admitted = results.filter((result) => result.ok);
      const rejected = results.filter((result) => !result.ok);
      expect(admitted).toHaveLength(2);
      expect(rejected).toHaveLength(applicantCount - 2);
      for (const rejection of rejected) {
        expect(rejection).toMatchObject({ code: "ROOM_FULL" });
      }

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority?.participantCount).toBe(MAX_PARTICIPANT_SEATS);
    });
  });
});
