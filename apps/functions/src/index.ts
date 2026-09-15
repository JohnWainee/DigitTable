import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { createAdmissionCallables } from "./callables.js";
import { createGameCallables } from "./gameCallables.js";

/**
 * `apps/functions`: the trusted, deployable Cloud Functions authority
 * (docs/ARCHITECTURE.md ADR-001). Phase 2 PR 3 hosts the admission/join
 * boundary here — the operable callables a real client actually invokes,
 * behind Firebase Auth and App Check monitoring, with per-IP/per-room-code
 * throttling (docs/PHASE_2_PLAN.md PR 3). Board task A03 adds `createRoom`
 * to the same boundary — the only way a room is provisioned, ETR
 * preselected, atomically with its creator's GM seat. Phase 2 PR 4 / board
 * task A04 adds the gameplay command authority to this same codebase.
 *
 * No project, region, or credential is named here: the Admin SDK resolves
 * the project from the runtime environment (`GCLOUD_PROJECT`, set by Cloud
 * Functions in deployment and by `firebase emulators:exec` locally).
 */
if (getApps().length === 0) {
  initializeApp();
}

const callables = createAdmissionCallables({
  db: getFirestore(),
  logger,
  now: () => Date.now(),
});

export const admitMember = callables.admitMember;
export const claimSeat = callables.claimSeat;
export const createRoom = callables.createRoom;
export const recoverSeat = callables.recoverSeat;

const gameCallables = createGameCallables({ db: getFirestore(), logger });
export const submitRoomCommand = gameCallables.submitRoomCommand;
