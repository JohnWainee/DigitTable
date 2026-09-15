import { useState } from "react";
import { Icon } from "./Icon.js";

export interface ThreatTokenProps {
  readonly threatId: string;
  readonly beaten?: boolean;
}

/** docs/ETR_ART_BRIEF.md section 3.4 asset manifest ids, matched against a substring of the real engine's own scene-authored threat id (e.g. `metro-platform-enforcer` -> `threat-enforcer`). */
const THREAT_IMAGE_ID_BY_SUBSTRING: readonly (readonly [string, string])[] = [
  ["enforcer", "threat-enforcer"],
  ["warden", "threat-warden"],
  ["patrol", "threat-patrol"],
  ["rifle-squad", "threat-rifle-squad"],
  ["plated-squad", "threat-plated-squad"],
  ["marksman-nest", "threat-marksman-nest"],
  ["armoured-truck", "threat-armoured-truck"],
];

function resolveImageId(threatId: string): string | null {
  const lower = threatId.toLowerCase();
  for (const [needle, imageId] of THREAT_IMAGE_ID_BY_SUBSTRING) {
    if (lower.includes(needle)) return imageId;
  }
  return null;
}

/**
 * docs/ETR_ART_BRIEF.md section 5: "Threat: charcoal square with the
 * `threat` glyph; crossed out in crimson when beaten" — the default until
 * `/etr/<imageId>-128.webp` loads, and permanent for threat ids with no
 * generated art yet (a real engine-authored id, e.g. `signal-mast-warden`,
 * with no substring match), which is correct per the brief's cut list, not
 * a bug.
 */
export function ThreatToken({ threatId, beaten }: ThreatTokenProps): JSX.Element {
  const imageId = resolveImageId(threatId);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    imageId ? "loading" : "error",
  );

  return (
    <span
      className={beaten ? "threat-token threat-token--beaten" : "threat-token"}
      aria-hidden="true"
    >
      {status !== "loaded" && (
        <span className="threat-token-fallback">
          <Icon name="threat" />
        </span>
      )}
      {status !== "error" && (
        <img
          src={`/etr/${imageId}-128.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          className="threat-token-image"
          style={{ opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {beaten && <span className="threat-token-cross" />}
    </span>
  );
}
