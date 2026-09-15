import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseSceneObjectiveInput, parseSceneThreatInput } from "./schemas.js";
import type { SceneDefinition } from "./scenes.js";

/**
 * B05: a GM's own private content pack (docs/ETR_RULES_MATRIX.md §5,
 * AGENTS.md "Non-negotiable boundaries", docs/EAT_THE_REICH_BUILD_GUIDE.md
 * "Licensing and content policy"). A GM who owns the rulebook may author
 * `content/private/*.json` scenes on their own machine — git-ignored (see
 * `.gitignore`), never committed, never uploaded to a shared Firestore
 * document another room could read.
 *
 * **Not exported from `./index.js`.** `node:fs`/`node:path` only run in a
 * Node context; `templates/eat-the-reich` is otherwise framework/runtime
 * agnostic and gets bundled into `apps/web`'s browser build via the
 * barrel export (AGENTS.md: "must build and run without apps/web ... or
 * any Firebase package present"). Import this module directly
 * (`@digitable/template-eat-the-reich/dist/privateContent.js` once built,
 * or `./src/privateContent.ts` in this monorepo) from Node-side tooling
 * only — a local CLI script, or a trusted Functions-side loader — never
 * from browser code. The GM console (Sonnet C) that lets a browser pick a
 * local file needs a different mechanism (the File System Access API or a
 * `<input type="file">`, a UI concern, not this module).
 */

class PrivateContentError extends Error {}

function fail(where: string, detail: string): never {
  throw new PrivateContentError(`private content pack: ${where}: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const REINFORCEMENTS_MODES = ["book", "simplified"] as const;

/**
 * Parses one already-`JSON.parse`d scene definition. Exported separately
 * from `loadPrivateContentPack` so a caller that already has the parsed
 * JSON (e.g. from a browser file picker, not `node:fs`) can validate it
 * without this module's filesystem dependency.
 */
export function parsePrivateSceneDefinition(value: unknown, where: string): SceneDefinition {
  if (!isRecord(value)) fail(where, "expected an object");
  const objectives = value.objectives;
  const threats = value.threats;
  const reinforcementsMode = value.reinforcementsMode;
  if (!Array.isArray(objectives)) fail(`${where}.objectives`, "expected an array");
  if (!Array.isArray(threats)) fail(`${where}.threats`, "expected an array");
  if (
    typeof reinforcementsMode !== "string" ||
    !(REINFORCEMENTS_MODES as readonly string[]).includes(reinforcementsMode)
  ) {
    fail(`${where}.reinforcementsMode`, `expected one of ${REINFORCEMENTS_MODES.join(", ")}`);
  }
  if (typeof value.sceneId !== "string" || value.sceneId.length === 0) {
    fail(`${where}.sceneId`, "expected a non-empty string");
  }
  if (typeof value.title !== "string" || value.title.length === 0) {
    fail(`${where}.title`, "expected a non-empty string");
  }
  if (typeof value.locationLabel !== "string") {
    fail(`${where}.locationLabel`, "expected a string");
  }
  if (typeof value.gmBriefing !== "string") {
    fail(`${where}.gmBriefing`, "expected a string");
  }
  return {
    sceneId: value.sceneId,
    title: value.title,
    locationLabel: value.locationLabel,
    objectives: objectives.map((o, i) => parseSceneObjectiveInput(o, `${where}.objectives[${i}]`)),
    threats: threats.map((t, i) => parseSceneThreatInput(t, `${where}.threats[${i}]`)),
    reinforcementsMode: reinforcementsMode as "book" | "simplified",
    gmBriefing: value.gmBriefing,
  };
}

/**
 * Reads every `*.json` file directly inside `directory` (default
 * `content/private` relative to the process's current working directory)
 * as one `SceneDefinition` each. Fails closed: a malformed file throws
 * rather than silently skipping or guessing a shape, and a missing
 * directory returns an empty list (no private pack loaded is a normal,
 * expected state, not an error).
 */
export function loadPrivateContentPack(
  directory: string = join(process.cwd(), "content", "private"),
): readonly SceneDefinition[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(directory);
  } catch (error) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((name) => extname(name) === ".json")
    .map((name) => {
      const filePath = join(directory, name);
      const raw = readFileSync(filePath, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        fail(filePath, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      }
      return parsePrivateSceneDefinition(parsed, basename(filePath));
    });
}

function isNodeErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
