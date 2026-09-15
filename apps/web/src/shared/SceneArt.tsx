import { useState } from "react";

export interface SceneArtProps {
  readonly sceneId: string;
  /** The scene's short name (`SceneView.title`) — shown as the condensed fallback caption, distinct from `SceneCard`'s own longer location description. */
  readonly title: string;
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

type LoadStatus = "loading" | "loaded" | "error";

/**
 * docs/ETR_ART_BRIEF.md section 5: the scene image slot's CSS fallback
 * (bone paper texture) is the default until the real `<img>` finishes
 * loading, and stays up if it never loads — missing or not-yet-generated
 * art never blocks play. `sceneId` maps to `/etr/<sceneId>-640.webp`
 * (C04's derivative naming convention); unrecognised or not-yet-generated
 * ids simply show the fallback forever, which is correct, not a bug.
 *
 * c07 P2: the fallback no longer repeats the scene's title as visible
 * text — `SceneCard`'s own `<h2>` renders it immediately after this, so
 * a duplicate line here (visible for the whole "loading" window, not
 * just a flash) was pure repetition. The pattern alone is enough context
 * for the art slot; the `<img>`'s `alt` still carries the real
 * description for anyone using a screen reader once the image is present.
 */
export function SceneArt({ sceneId, title }: SceneArtProps): JSX.Element {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const alt = SCENE_ALT[sceneId] ?? title;

  return (
    <div className="scene-card-art">
      <div className="scene-card-art-fallback" aria-hidden="true" />
      {status !== "error" && (
        <img
          src={`/etr/${sceneId}-640.webp`}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="scene-card-art-image"
          style={{ opacity: status === "loaded" ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  );
}
