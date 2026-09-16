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
  /** Whether the caller's submitted secret matches the room's general (player/GM) passphrase. */
  readonly passphraseValid: boolean;
  /**
   * Whether the caller's submitted secret matches the room's separate table
   * code (docs/ARCHITECTURE.md section 8: "The GM admits it using a
   * separate table code."). Knowing the general room passphrase must never
   * satisfy this — the table seat is not self-claimable with the same
   * secret every player uses.
   */
  readonly tablePassphraseValid: boolean;
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
 * `snapshot` by the caller.
 *
 * Order matters:
 *
 * 1. Archived rooms are denied before anything else.
 * 2. The secret matching the *requested* capability must be correct first —
 *    a general room passphrase never satisfies a `table` request, and vice
 *    versa (docs/ARCHITECTURE.md section 8's separate table code), and this
 *    check applies even to an already-bound identity: reclaiming a seat
 *    still requires the correct current secret, so a since-rotated
 *    passphrase or table code actually locks out a stale identity rather
 *    than being bypassable by reconnecting instead of joining fresh (Phase
 *    2 PR 3 review).
 * 3. Only once the secret is proven does an already-bound identity
 *    reconnecting (the `existingBinding` branch) get accepted or rejected
 *    as a capability mismatch, before capacity/closure are even considered,
 *    so a legitimate reconnect never trips a cap that only applies to new
 *    occupants.
 */
export function decideAdmitMember(
  input: AdmitMemberInput,
  snapshot: RoomAdmissionSnapshot,
): AdmissionDecision {
  if (snapshot.roomStatus === "archived") {
    return deniedFrom(stableError("ROOM_ARCHIVED", "This room has been archived."));
  }

  const secretValid =
    input.requestedCapability === "table"
      ? snapshot.tablePassphraseValid
      : snapshot.passphraseValid;
  if (!secretValid) {
    return deniedFrom(
      stableError("INVALID_PASSPHRASE", "The room code or passphrase is incorrect."),
    );
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
 * purity and ordering discipline as `decideAdmitMember`: the passphrase is
 * checked first, before an already-bound GM's reconnect is honored (Phase 2
 * PR 3 review — a stale identity must not bypass a rotated passphrase by
 * reclaiming instead of joining fresh). A `gmMemberId` that does
 * not match the caller's own GM binding — or any seated GM when the caller
 * is unbound — always denies `GM_SEAT_TAKEN`, regardless of capacity — the GM seat is exclusive, not capacity-limited in
 * the way player seats are.
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

  if (!snapshot.passphraseValid) {
    return deniedFrom(
      stableError("INVALID_PASSPHRASE", "The room code or passphrase is incorrect."),
    );
  }

  if (snapshot.existingBinding !== null) {
    if (snapshot.existingBinding.capability !== "gm") {
      return deniedFrom(
        stableError("ROLE_FORBIDDEN", "This identity already holds a different seat in this room."),
      );
    }
    // A GM binding that does not match the authority's seated GM is
    // inconsistent data (a stale binding after a transfer, or corruption);
    // it never reclaims the seat (second pass, C7).
    if (snapshot.gmMemberId !== snapshot.existingBinding.memberId) {
      return deniedFrom(
        stableError("GM_SEAT_TAKEN", "This room's GM seat has already been claimed."),
      );
    }
    return {
      outcome: "reclaim",
      memberId: snapshot.existingBinding.memberId,
      capability: "gm",
    };
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
