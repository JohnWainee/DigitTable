import type { CommandId, RoomId } from "./ids.js";

/**
 * Envelope wrapping a template-defined command payload. Matches
 * docs/ARCHITECTURE.md section 7. `expectedRevision` is present only for the
 * command families that are explicitly revision-gated (scene transitions,
 * encounter loads, GM-seat administration); entity-scoped actions and safety
 * interrupts omit it and rely on entity preconditions instead.
 */
export interface CommandEnvelope<T> {
  readonly commandId: CommandId;
  readonly roomId: RoomId;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly expectedRevision?: number;
  readonly issuedAtClient: string;
  readonly payload: T;
}
