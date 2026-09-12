import type { CommandId, EventId, MemberId } from "./ids.js";

/** Matches docs/ARCHITECTURE.md section 7. Safety events always use "anonymous". */
export type EventActor =
  | { readonly kind: "member"; readonly memberId: MemberId }
  | { readonly kind: "anonymous" }
  | { readonly kind: "system" };

/**
 * Where a (possibly redacted) copy of an event is stored. An event copied to
 * more than one physical visibility partition retains one logical event ID;
 * uniqueness of the stored document comes from the partition path, not from
 * `eventId` alone (docs/ARCHITECTURE.md section 7).
 */
export type EventDestination =
  | { readonly kind: "shared" }
  | { readonly kind: "gm" }
  | { readonly kind: "member"; readonly memberId: MemberId };

export function destinationKey(destination: EventDestination): string {
  switch (destination.kind) {
    case "shared":
      return "shared";
    case "gm":
      return "gm";
    case "member":
      return `member:${destination.memberId}`;
  }
}

/** Wire envelope wrapping a template-defined event payload for storage/delivery. */
export interface EventEnvelope<T> {
  readonly eventId: EventId;
  readonly commandId: CommandId;
  readonly sequence: number;
  readonly roomRevision: number;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly schemaVersion: number;
  readonly actor: EventActor;
  readonly occurredAtServer: string;
  readonly payload: T;
}
