import type { CreateRoomReceiptDocument } from "@digitable/contracts";

/**
 * Board task A03: whether a `createRoom` request is brand new or a retry of
 * one that already succeeded. Pure — the transactional orchestrator
 * (`apps/functions/src/createRoomAuthority.ts`) reads
 * `createRoomReceipts/{requestId}` and hands the result (or its absence)
 * here; this function makes no I/O decision of its own, matching
 * `packages/engine/src/admission.ts`'s decide/orchestrate split.
 */
export type CreateRoomDecision =
  | { readonly outcome: "create" }
  | { readonly outcome: "replay"; readonly receipt: CreateRoomReceiptDocument };

export function decideCreateRoom(
  existingReceipt: CreateRoomReceiptDocument | null,
): CreateRoomDecision {
  return existingReceipt === null
    ? { outcome: "create" }
    : { outcome: "replay", receipt: existingReceipt };
}
