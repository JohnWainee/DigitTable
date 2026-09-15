import {
  asMemberId,
  MAX_PARTICIPANT_SEATS,
  type AdmitMemberInput,
  type ClaimSeatInput,
} from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import {
  decideAdmitMember,
  decideClaimSeat,
  type RoomAdmissionSnapshot,
} from "../src/admission.js";

const baseSnapshot: RoomAdmissionSnapshot = {
  roomStatus: "active",
  admissionStatus: "open",
  participantCount: 1,
  tableSeatClaimed: false,
  gmMemberId: asMemberId("member-gm"),
  passphraseValid: true,
  tablePassphraseValid: true,
  existingBinding: null,
};

const admitPlayerInput: AdmitMemberInput = {
  roomCode: "ROOM-CODE",
  passphrase: "shared secret",
  requestedCapability: "player",
  displayName: "Rook",
};

const admitTableInput: AdmitMemberInput = {
  ...admitPlayerInput,
  requestedCapability: "table",
};

const claimSeatInput: ClaimSeatInput = {
  roomCode: "ROOM-CODE",
  passphrase: "shared secret",
  displayName: "Director",
};

describe("decideAdmitMember", () => {
  it("creates a new player seat when the room has room and the passphrase is correct", () => {
    const decision = decideAdmitMember(admitPlayerInput, baseSnapshot);
    expect(decision).toEqual({ outcome: "create", capability: "player" });
  });

  it("creates the single table seat when it is unclaimed", () => {
    const decision = decideAdmitMember(admitTableInput, baseSnapshot);
    expect(decision).toEqual({ outcome: "create", capability: "table" });
  });

  it("denies an archived room before checking anything else", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      roomStatus: "archived",
      passphraseValid: false,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROOM_ARCHIVED" });
  });

  it("denies an incorrect passphrase (admission policy)", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      passphraseValid: false,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("a valid general passphrase does not admit the table seat (separate table code required)", () => {
    const decision = decideAdmitMember(admitTableInput, {
      ...baseSnapshot,
      passphraseValid: true,
      tablePassphraseValid: false,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("a valid table code does not admit a player seat", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      passphraseValid: false,
      tablePassphraseValid: true,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("denies a new player when admission is closed", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      admissionStatus: "closed",
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ADMISSION_CLOSED" });
  });

  it("denies a new player at the participant capacity (8 seats)", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      participantCount: MAX_PARTICIPANT_SEATS,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROOM_FULL" });
  });

  it("admits the 8th participant exactly at the boundary", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      participantCount: MAX_PARTICIPANT_SEATS - 1,
    });
    expect(decision).toEqual({ outcome: "create", capability: "player" });
  });

  it("denies a table request when the table seat is already claimed", () => {
    const decision = decideAdmitMember(admitTableInput, {
      ...baseSnapshot,
      tableSeatClaimed: true,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROOM_FULL" });
  });

  it("a table request never consumes a participant seat and ignores the participant cap", () => {
    const decision = decideAdmitMember(admitTableInput, {
      ...baseSnapshot,
      participantCount: MAX_PARTICIPANT_SEATS,
    });
    expect(decision).toEqual({ outcome: "create", capability: "table" });
  });

  it("reclaims (idempotent) when the caller's UID is already bound to a matching-capability seat and the passphrase is still correct", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      admissionStatus: "closed",
      participantCount: MAX_PARTICIPANT_SEATS,
      passphraseValid: true,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "player" },
    });
    expect(decision).toEqual({
      outcome: "reclaim",
      memberId: asMemberId("member-existing"),
      capability: "player",
    });
  });

  it("denies a reclaim when the passphrase is now wrong, even for an already-bound identity", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      passphraseValid: false,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "player" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("denies a table reclaim when the table code is now wrong", () => {
    const decision = decideAdmitMember(admitTableInput, {
      ...baseSnapshot,
      tablePassphraseValid: false,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "table" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("privilege escalation: refuses to reinterpret an existing player binding as a table seat", () => {
    const decision = decideAdmitMember(admitTableInput, {
      ...baseSnapshot,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "player" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROLE_FORBIDDEN" });
  });

  it("privilege escalation: refuses to reinterpret an existing GM binding as a player seat", () => {
    const decision = decideAdmitMember(admitPlayerInput, {
      ...baseSnapshot,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "gm" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROLE_FORBIDDEN" });
  });
});

describe("decideClaimSeat", () => {
  const emptyGmSnapshot: RoomAdmissionSnapshot = { ...baseSnapshot, gmMemberId: null };

  it("creates the GM seat when it is empty", () => {
    const decision = decideClaimSeat(claimSeatInput, emptyGmSnapshot);
    expect(decision).toEqual({ outcome: "create", capability: "gm" });
  });

  it("denies a second GM claim (GM-seat exclusivity)", () => {
    const decision = decideClaimSeat(claimSeatInput, baseSnapshot);
    expect(decision).toMatchObject({ outcome: "denied", code: "GM_SEAT_TAKEN" });
  });

  it("GM_SEAT_TAKEN outranks capacity: denies even when participant seats remain open", () => {
    const decision = decideClaimSeat(claimSeatInput, { ...baseSnapshot, participantCount: 1 });
    expect(decision).toMatchObject({ outcome: "denied", code: "GM_SEAT_TAKEN" });
  });

  it("denies an incorrect passphrase before checking the GM seat", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...emptyGmSnapshot,
      passphraseValid: false,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("denies claiming the GM seat when admission is closed", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...emptyGmSnapshot,
      admissionStatus: "closed",
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ADMISSION_CLOSED" });
  });

  it("denies claiming the GM seat at the participant capacity", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...emptyGmSnapshot,
      participantCount: MAX_PARTICIPANT_SEATS,
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROOM_FULL" });
  });

  it("reclaims (idempotent) when the caller's UID is already the bound GM", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...baseSnapshot,
      passphraseValid: true,
      existingBinding: { memberId: asMemberId("member-gm"), capability: "gm" },
    });
    expect(decision).toEqual({
      outcome: "reclaim",
      memberId: asMemberId("member-gm"),
      capability: "gm",
    });
  });

  it("denies GM_SEAT_TAKEN when a gm binding does not match the authority's seated GM (second pass C7)", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...baseSnapshot,
      gmMemberId: asMemberId("member-other-gm"),
      existingBinding: { memberId: asMemberId("member-gm"), capability: "gm" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "GM_SEAT_TAKEN" });
    const openSeat = decideClaimSeat(claimSeatInput, {
      ...baseSnapshot,
      gmMemberId: null,
      existingBinding: { memberId: asMemberId("member-gm"), capability: "gm" },
    });
    expect(openSeat).toMatchObject({ outcome: "denied", code: "GM_SEAT_TAKEN" });
  });

  it("denies a GM reclaim when the passphrase is now wrong, even for the already-bound GM", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...baseSnapshot,
      passphraseValid: false,
      existingBinding: { memberId: asMemberId("member-gm"), capability: "gm" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "INVALID_PASSPHRASE" });
  });

  it("privilege escalation: a bound player cannot claim the GM seat via ClaimSeat", () => {
    const decision = decideClaimSeat(claimSeatInput, {
      ...emptyGmSnapshot,
      existingBinding: { memberId: asMemberId("member-existing"), capability: "player" },
    });
    expect(decision).toMatchObject({ outcome: "denied", code: "ROLE_FORBIDDEN" });
  });
});
