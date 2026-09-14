import {
  MAX_PARTICIPANT_SEATS,
  stableError,
  type AdmissionStatus,
  type AdmitMemberInput,
  type Capability,
  type ClaimSeatInput,
  type MemberId,
  type RoomStatus,
  type StableError,
} from "@digitable/contracts";

/**
 * Trusted, server-resolved facts the admission authority reads before
 * deciding. Every field here comes from a privileged Firestore read (never
 * from the untrusted request payload) — in particular `existingBinding`
 * comes from `uidBindings/{uid}` keyed by the caller's verified auth UID,
 * and `passphraseValid` is the result of a prior hash comparison, never the
 * raw stored hash or the caller's claimed passphrase.
 */
export interface RoomAdmissionSnapshot {
  readonly roomStatus: RoomStatus;
  readonly admissionStatus: AdmissionStatus;
  readonly participantCount: number;
  readonly tableSeatClaimed: boolean;
  readonly gmMemberId: MemberId | null;
  readonly passphraseValid: boolean;
  readonly existingBinding: {
    readonly memberId: MemberId;
    readonly capability: Capability;
  } | null;
}

export type AdmissionDecision =
  | { readonly outcome: "create"; readonly capability: Capability }
  | { readonly outcome: "reclaim"; readonly memberId: MemberId; readonly capability: Capability }
  | ({ readonly outcome: "denied" } & StableError);

function deniedFrom(error: StableError): AdmissionDecision {
  return { outcome: "denied", code: error.code, message: error.message };
}

/**
 * Decides an `AdmitMember` request against a trusted snapshot. Pure: no I/O,
 * no clock, no randomness — every fact it needs is already resolved onto
 * `snapshot` by the caller. Order matters: an already-bound identity
 * reconnecting (the `existingBinding` branch) is checked, and either
 * accepted or rejected as a capability mismatch, before capacity/closure are
 * even considered, so reconnecting never trips a cap that only applies to
 * new occupants.
 */
export function decideAdmitMember(
  input: AdmitMemberInput,
  snapshot: RoomAdmissionSnapshot,
): AdmissionDecision {
  if (snapshot.roomStatus === "archived") {
    return deniedFrom(stableError("ROOM_ARCHIVED", "This room has been archived."));
  }

  if (snapshot.existingBinding !== null) {
    if (snapshot.existingBinding.capability !== input.requestedCapability) {
      return deniedFrom(
        stableError("ROLE_FORBIDDEN", "This identity already holds a different seat in this room."),
      );
    }
    return {
      outcome: "reclaim",
      memberId: snapshot.existingBinding.memberId,
      capability: snapshot.existingBinding.capability,
    };
  }

  if (!snapshot.passphraseValid) {
    return deniedFrom(
      stableError("INVALID_PASSPHRASE", "The room code or passphrase is incorrect."),
    );
  }

  if (snapshot.admissionStatus === "closed") {
    return deniedFrom(
      stableError("ADMISSION_CLOSED", "This room is not currently admitting new members."),
    );
  }

  if (input.requestedCapability === "table") {
    if (snapshot.tableSeatClaimed) {
      return deniedFrom(stableError("ROOM_FULL", "This room's table seat is taken."));
    }
    return { outcome: "create", capability: "table" };
  }

  if (snapshot.participantCount >= MAX_PARTICIPANT_SEATS) {
    return deniedFrom(stableError("ROOM_FULL", "This room has no open participant seats."));
  }
  return { outcome: "create", capability: "player" };
}

/**
 * Decides a `ClaimSeat` (GM) request against a trusted snapshot. Same
 * purity and ordering discipline as `decideAdmitMember`. A non-null
 * `gmMemberId` that does not match the caller's own binding always denies
 * `GM_SEAT_TAKEN`, regardless of capacity — the GM seat is exclusive, not
 * capacity-limited in the way player seats are.
 */
export function decideClaimSeat(
  // Unused: a GM claim has no capability choice or other field this decision
  // needs — `input` stays in the signature for symmetry with
  // `decideAdmitMember` and because the caller (the transactional
  // orchestrator) still needs `input.displayName` to create the seat.
  _input: ClaimSeatInput,
  snapshot: RoomAdmissionSnapshot,
): AdmissionDecision {
  if (snapshot.roomStatus === "archived") {
    return deniedFrom(stableError("ROOM_ARCHIVED", "This room has been archived."));
  }

  if (snapshot.existingBinding !== null) {
    if (snapshot.existingBinding.capability !== "gm") {
      return deniedFrom(
        stableError("ROLE_FORBIDDEN", "This identity already holds a different seat in this room."),
      );
    }
    return {
      outcome: "reclaim",
      memberId: snapshot.existingBinding.memberId,
      capability: "gm",
    };
  }

  if (!snapshot.passphraseValid) {
    return deniedFrom(
      stableError("INVALID_PASSPHRASE", "The room code or passphrase is incorrect."),
    );
  }

  if (snapshot.gmMemberId !== null) {
    return deniedFrom(
      stableError("GM_SEAT_TAKEN", "This room's GM seat has already been claimed."),
    );
  }

  if (snapshot.admissionStatus === "closed") {
    return deniedFrom(
      stableError("ADMISSION_CLOSED", "This room is not currently admitting new members."),
    );
  }

  if (snapshot.participantCount >= MAX_PARTICIPANT_SEATS) {
    return deniedFrom(stableError("ROOM_FULL", "This room has no open participant seats."));
  }

  return { outcome: "create", capability: "gm" };
}
