import { useState } from "react";
import { HERO_ART } from "./artPaths.js";

/**
 * Landing hero (original placeholder art, provenance in
 * assets/generated/eat-the-reich/README.md). The CSS fallback stays
 * underneath and is the whole hero if the image never loads.
 */
export function HeroArt(): JSX.Element {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <div className="hero-art">
      <div className="hero-art-fallback" aria-hidden="true" />
      {status !== "error" && (
        <img
          src={HERO_ART.src}
          srcSet={HERO_ART.srcSet}
          sizes="(min-width: 40rem) 40rem, 100vw"
          alt={HERO_ART.alt}
          width={HERO_ART.width}
          height={HERO_ART.height}
          decoding="async"
          className="hero-art-image"
          style={{ opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  );
}
