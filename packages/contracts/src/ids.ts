/**
 * Branded string identifiers. Branding prevents accidentally passing a raw
 * string of the wrong kind (e.g. a commandId where a memberId is expected)
 * without requiring runtime wrapper objects.
 */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type RoomId = Brand<string, "RoomId">;
export type MemberId = Brand<string, "MemberId">;
export type CommandId = Brand<string, "CommandId">;
export type EventId = Brand<string, "EventId">;
export type ReceiptId = Brand<string, "ReceiptId">;
export type TemplateId = Brand<string, "TemplateId">;

/** Reserved, non-member viewer identifiers used for shared/table projections. */
export const RESERVED_VIEWER_IDS = ["gm", "table"] as const;
export type ReservedViewerId = (typeof RESERVED_VIEWER_IDS)[number];

/** A projection viewer is a stable member, the GM seat, or the shared table seat. */
export type ViewerId = MemberId | ReservedViewerId;

export function isReservedViewerId(value: string): value is ReservedViewerId {
  return (RESERVED_VIEWER_IDS as readonly string[]).includes(value);
}

export function asRoomId(value: string): RoomId {
  return value as RoomId;
}

export function asMemberId(value: string): MemberId {
  return value as MemberId;
}

export function asCommandId(value: string): CommandId {
  return value as CommandId;
}

export function asEventId(value: string): EventId {
  return value as EventId;
}

export function asReceiptId(value: string): ReceiptId {
  return value as ReceiptId;
}

export function asTemplateId(value: string): TemplateId {
  return value as TemplateId;
}
