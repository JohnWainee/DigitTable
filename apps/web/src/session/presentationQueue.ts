/**
 * Pure selection helpers over the player dashboard's presentation queue.
 * The queue is ordered by sequence and contains only events the viewer was
 * authorized to read; projections remain the sole source of domain state.
 * These helpers never mutate the queue and never reconstruct state from
 * events — the queued `ActionResolved`/`InjuryCategoryChosen` payloads are
 * already complete.
 */
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import type { PresentationItem } from "./useRoomProjection.js";

export type ActionResolvedEvent = Extract<EatTheReichEvent, { type: "ActionResolved" }>;

export interface OwnResolution {
  readonly event: ActionResolvedEvent;
  readonly attackSuccessesRolled: number;
  /**
   * Every queued event id this resolution was built from (the
   * `ActionResolved`, plus a later `InjuryCategoryChosen` when merged), so a
   * "continue" can acknowledge them all.
   */
  readonly eventIds: readonly string[];
}

/**
 * The first (lowest-sequence) queued `ActionResolved` for `characterId`,
 * merged with a later same-roll `InjuryCategoryChosen` when one is queued.
 */
export function selectOwnResolution(
  queue: readonly PresentationItem[],
  characterId: string,
): OwnResolution | null {
  let resolvedItem: PresentationItem | null = null;
  let resolvedIndex = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    if (
      item &&
      item.payload.type === "ActionResolved" &&
      item.payload.characterId === characterId
    ) {
      resolvedItem = item;
      resolvedIndex = index;
      break;
    }
  }
  if (!resolvedItem || resolvedItem.payload.type !== "ActionResolved") return null;
  const resolved = resolvedItem.payload;
  const eventIds: string[] = [resolvedItem.eventId];
  let event: ActionResolvedEvent = resolved;
  for (let index = resolvedIndex + 1; index < queue.length; index += 1) {
    const item = queue[index];
    if (
      item &&
      item.payload.type === "InjuryCategoryChosen" &&
      item.payload.characterId === characterId &&
      item.payload.rollId === resolved.rollId
    ) {
      event = { ...resolved, injuryMark: item.payload.mark, injuryChoicePendingMode: null };
      eventIds.push(item.eventId);
      break;
    }
  }
  return {
    event,
    attackSuccessesRolled: resolvedItem.attackSuccessesRolled ?? 0,
    eventIds,
  };
}

/** True for an `ActionResolved`/`InjuryCategoryChosen` item belonging to `characterId`. */
export function isOwnResolutionItem(item: PresentationItem, characterId: string): boolean {
  return (
    (item.payload.type === "ActionResolved" || item.payload.type === "InjuryCategoryChosen") &&
    item.payload.characterId === characterId
  );
}

/**
 * True for a queued item the dashboard must keep for the summary: an own
 * `ActionResolved`, or an own `InjuryCategoryChosen` whose `ActionResolved`
 * is still queued to merge into. An own `InjuryCategoryChosen` with no queued
 * `ActionResolved` (its summary was already dismissed) is not held, so it can
 * be acknowledged instead of pinning the ledger cursor.
 */
export function isHeldForResolution(
  queue: readonly PresentationItem[],
  item: PresentationItem,
  characterId: string,
): boolean {
  if (!isOwnResolutionItem(item, characterId)) return false;
  if (item.payload.type === "ActionResolved") return true;
  if (item.payload.type !== "InjuryCategoryChosen") return false;
  const { rollId } = item.payload;
  return queue.some(
    (other) =>
      other.payload.type === "ActionResolved" &&
      other.payload.characterId === characterId &&
      other.payload.rollId === rollId,
  );
}
