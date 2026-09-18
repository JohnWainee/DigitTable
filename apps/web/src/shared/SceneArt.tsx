import { useState } from "react";
import { sceneArtSrc } from "./artPaths.js";

export interface SceneArtProps {
  readonly sceneId: string;
  /** The scene's short name (`SceneView.title`) — the alt text for a scene id with no authored description. */
  readonly title: string;
  /** "banner" (shared table display) tries the 1024/1536 derivatives first, then the 640 card image, then the CSS fallback. */
  readonly variant?: "card" | "banner";
}

const SCENE_ALT: Record<string, string> = {
  "drop-forecourt":
    "A rail-station forecourt at dusk, its cobbles cratered by fallen steel boxes, dust hanging in the searchlights.",
  "metro-platform": "An abandoned, wet Métro platform leads toward a sealed door glowing red.",
  printworks:
    "A cavernous print hall with rolling presses and ink drums, posters stacked face-down, a loading-yard door open to the rain.",
  "signal-mast":
    "A steel broadcast mast on a river bluff at night, its control cabin lit above the darkened city.",
};

type Stage = "large" | "small" | "none";

/**
 * docs/ETR_ART_BRIEF.md section 5: the scene image slot's CSS fallback
 * (bone paper texture) is the default until the real `<img>` finishes
 * loading, and stays up if it never loads — missing or not-yet-generated
 * art never blocks play. Unrecognised ids simply show the fallback forever,
 * which is correct, not a bug.
 *
 * The fallback carries no text: `SceneCard`'s own `<h2>` renders the title
 * immediately after this, and the `<img>`'s `alt` carries the description
 * for anyone using a screen reader once the image is present.
 */
export function SceneArt({ sceneId, title, variant = "card" }: SceneArtProps): JSX.Element {
  const banner = variant === "banner";
  const identity = `${sceneId}:${variant}`;
  const initialStage: Stage = banner ? "large" : "small";
  const [state, setState] = useState<{ identity: string; stage: Stage; loaded: boolean }>({
    identity,
    stage: initialStage,
    loaded: false,
  });
  // Reused for a different scene/variant: start over instead of inheriting the last image's outcome.
  if (state.identity !== identity) setState({ identity, stage: initialStage, loaded: false });
  const { stage, loaded } =
    state.identity === identity ? state : { stage: initialStage, loaded: false };
  const alt = SCENE_ALT[sceneId] ?? title;

  function handleError(): void {
    setState({ identity, stage: stage === "large" ? "small" : "none", loaded: false });
  }

  return (
    <div className={banner ? "scene-card-art scene-card-art--banner" : "scene-card-art"}>
      <div className="scene-card-art-fallback" aria-hidden="true" />
      {stage !== "none" && (
        <img
          key={stage}
          src={sceneArtSrc(sceneId, stage === "large" ? 1024 : 640)}
          srcSet={
            stage === "large"
              ? `${sceneArtSrc(sceneId, 1024)} 1024w, ${sceneArtSrc(sceneId, 1536)} 1536w`
              : undefined
          }
          sizes={stage === "large" ? "(min-width: 1280px) 46rem, 100vw" : undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="scene-card-art-image"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setState({ identity, stage, loaded: true })}
          onError={handleError}
        />
      )}
    </div>
  );
}
