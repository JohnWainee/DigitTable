import type { LocalOwnershipRecord } from "../session/ownership.js";

/**
 * Where the landing "Resume" button goes. A player resumes at the dashboard:
 * whether they have claimed a character is server state (their projection),
 * not something this browser can know, so `PlayerDashboardScreen` itself
 * forwards a player with no claimed character to the picker rather than the
 * landing page guessing from a possibly stale local record.
 */
export function resumeRoute(ownership: LocalOwnershipRecord): string {
  if (ownership.capability === "gm") return `/room/${ownership.roomId}/gm`;
  if (ownership.capability === "table") return `/room/${ownership.roomId}/table`;
  return `/room/${ownership.roomId}/player`;
}
