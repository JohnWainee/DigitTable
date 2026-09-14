import type { Capability } from "./template.js";

/**
 * Untrusted join input submitted to the admission authority. The authority
 * resolves the room code and creates the stable seat; neither a room ID nor a
 * member ID is client-asserted here.
 */
export interface AdmitMemberInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly requestedCapability: Exclude<Capability, "gm">;
  readonly displayName: string;
}

/** Untrusted request to claim the single GM seat for a room reached by code. */
export interface ClaimSeatInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly displayName: string;
}

/** Platform-owned room lifecycle commands; these never enter a game template. */
export type AdmissionCommand =
  | { readonly type: "AdmitMember"; readonly input: AdmitMemberInput }
  | { readonly type: "ClaimSeat"; readonly input: ClaimSeatInput };

/** Result returned once a trusted authority has created or claimed a stable seat. */
export interface AdmissionAccepted {
  readonly memberId: string;
  readonly capability: Capability;
  /** Shown exactly once by the client; the server stores only a slow salted hash. */
  readonly recoveryCode: string;
}
