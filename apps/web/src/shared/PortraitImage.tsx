import { useState } from "react";

export interface PortraitImageProps {
  readonly characterId: string;
  readonly name: string;
  readonly className?: string;
  readonly downed?: boolean;
  /** "card" (roster claim grid, larger) vs "token" (party strip/roster panel, small). Defaults to "token". */
  readonly size?: "card" | "token";
}

/**
 * F05 P1: a name segment wrapped in punctuation (a quoted nickname, e.g.
 * `Grigor "Tallow" Belyakov`) previously contributed its leading quote
 * mark as an "initial" (`G"`). Strip non-letters from each whitespace
 * segment first, so only real letters are ever taken.
 */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * docs/ETR_ART_BRIEF.md section 5: "Portrait/token: charcoal circle with a
 * bone two-letter monogram, crimson ring when downed" — the default until
 * `/etr/<characterId>-token-128.webp` (section 3.2's token derivative)
 * loads, and permanent if it never does (unmatched/not-yet-generated
 * character ids included).
 */
export function PortraitImage({
  characterId,
  name,
  className,
  downed,
  size = "token",
}: PortraitImageProps): JSX.Element {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const classes = [
    "roster-card-portrait",
    size === "card" ? "roster-card-portrait--card" : "",
    downed ? "roster-card-portrait--downed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const src =
    size === "card" ? `/etr/${characterId}-512.webp` : `/etr/${characterId}-token-128.webp`;

  return (
    <span className={classes} aria-hidden="true">
      <span className="portrait-image-fallback" aria-hidden={status === "loaded"}>
        {initials(name)}
      </span>
      {status !== "error" && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="portrait-image"
          style={{ opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </span>
  );
}
