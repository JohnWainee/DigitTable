import { useState } from "react";
import { Icon } from "./Icon.js";

export interface ThreatTokenProps {
  readonly threatId: string;
  readonly beaten?: boolean;
}

const THREAT_IMAGE_IDS = new Set([
  "threat-enforcer",
  "threat-warden",
  "threat-patrol",
  "threat-rifle-squad",
  "threat-plated-squad",
  "threat-marksman-nest",
  "threat-armoured-truck",
]);

/**
 * docs/ETR_ART_BRIEF.md section 5: "Threat: charcoal square with the
 * `threat` glyph; crossed out in crimson when beaten" — the default until
 * `/etr/<threatId>-128.webp` loads, and permanent for threat ids with no
 * generated art yet. Fixture threat ids (`patrol-a`, `the-enforcer`, ...)
 * don't match the asset-manifest ids 1:1, so callers pass the manifest id
 * only when they have one; anything else (or not in THREAT_IMAGE_IDS)
 * renders the glyph fallback, which is correct per the brief's cut list,
 * not a bug.
 */
export function ThreatToken({ threatId, beaten }: ThreatTokenProps): JSX.Element {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    THREAT_IMAGE_IDS.has(threatId) ? "loading" : "error",
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
          src={`/etr/${threatId}-128.webp`}
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
