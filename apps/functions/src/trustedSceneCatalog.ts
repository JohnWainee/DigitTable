import {
  ORIGINAL_MISSION,
  type EatTheReichCommand,
  type SceneDefinition,
} from "@digitable/template-eat-the-reich";
import { parseUidBindingDocument, type Capability } from "@digitable/contracts";
import type { Firestore } from "firebase-admin/firestore";

export type OriginalSceneCommand = Extract<
  EatTheReichCommand,
  { readonly type: "LoadOriginalScene" | "NextOriginalScene" }
>;

export type TrustedSceneCommandResult =
  | { readonly ok: true; readonly command: EatTheReichCommand }
  | { readonly ok: false; readonly code: "ROLE_FORBIDDEN" | "UNKNOWN_ACTION" };

/** Resolve only after platform membership has been established; catalog text stays in Functions. */
export function resolveOriginalSceneCommand(
  command: EatTheReichCommand,
  capability: Capability,
): TrustedSceneCommandResult {
  if (command.type !== "LoadOriginalScene" && command.type !== "NextOriginalScene") {
    return { ok: true, command };
  }
  if (capability !== "gm") return { ok: false, code: "ROLE_FORBIDDEN" };

  const definition = ORIGINAL_MISSION.find((scene) => scene.sceneId === command.sceneId);
  if (!definition) return { ok: false, code: "UNKNOWN_ACTION" };
  const { gmBriefing: _gmBriefing, ...scene } = definition;
  return command.type === "LoadOriginalScene"
    ? { ok: true, command: { type: "LoadScene", ...scene } }
    : { ok: true, command: { type: "NextScene", ...scene, reason: command.reason } };
}

export type { SceneDefinition };

/** Private catalog values returned only after the callable verifies a GM uid binding. */
export function trustedOriginalSceneCatalog(): readonly SceneDefinition[] {
  return ORIGINAL_MISSION;
}

export class EncounterCatalogAccessError extends Error {
  constructor(readonly code: "AUTH_REQUIRED" | "ROLE_FORBIDDEN" | "ROOM_DATA_INVALID") {
    super(code);
  }
}

/** Read the private catalog only for a live, server-verified GM seat. */
export async function getAuthorizedOriginalSceneCatalog(
  db: Firestore,
  roomId: string,
  uid: string,
): Promise<readonly SceneDefinition[]> {
  return db.runTransaction(async (txn) => {
    const bindingSnap = await txn.get(db.doc(`rooms/${roomId}/uidBindings/${uid}`));
    if (!bindingSnap.exists) throw new EncounterCatalogAccessError("AUTH_REQUIRED");
    let binding;
    try {
      binding = parseUidBindingDocument(bindingSnap.data());
    } catch {
      throw new EncounterCatalogAccessError("ROOM_DATA_INVALID");
    }
    if (binding.capability !== "gm") throw new EncounterCatalogAccessError("ROLE_FORBIDDEN");
    return trustedOriginalSceneCatalog();
  });
}
