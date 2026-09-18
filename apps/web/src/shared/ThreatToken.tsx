import { useState } from "react";
import { Icon } from "./Icon.js";
import { threatArtSrc } from "./artPaths.js";

export interface ThreatTokenProps {
  readonly threatId: string;
  readonly beaten?: boolean;
}

/**
 * docs/ETR_ART_BRIEF.md section 5: "Threat: charcoal square with the
 * `threat` glyph; crossed out in crimson when beaten" — the default until
 * the threat's `-128.webp` (see `artPaths.ts`) loads, and permanent for threat ids
 * with no generated art (no substring match), which is correct per the
 * brief's cut list, not a bug.
 */
export function ThreatToken({ threatId, beaten }: ThreatTokenProps): JSX.Element {
  const src = threatArtSrc(threatId);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

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
          src={src ?? undefined}
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
