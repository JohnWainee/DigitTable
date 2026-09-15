import { ETR_SCENE_FIXTURE } from "../../test/fixtures/etrTemp.js";

export interface RouteMapProps {
  readonly currentSceneId: string;
  readonly clearedSceneIds: readonly string[];
}

/**
 * docs/ETR_ART_BRIEF.md section 3.6: an original, schematic Paris route
 * map, code-drawn SVG. No tactical movement, no line-of-sight, no
 * measuring — just the four scene nodes and their state.
 * `prefers-reduced-motion` disables the current-node pulse (CSS only).
 */
export function RouteMap({ currentSceneId, clearedSceneIds }: RouteMapProps): JSX.Element {
  const nodes = ETR_SCENE_FIXTURE;
  const path = nodes.map((n) => `${n.mapX},${n.mapY}`).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      className="route-map"
      role="img"
      aria-label={`Route map. Current scene: ${nodes.find((n) => n.id === currentSceneId)?.location ?? "unknown"}.`}
    >
      {/* River: a single bezier band, per the art brief. */}
      <path d="M -5 95 Q 40 70 105 5" className="route-map-river" fill="none" />
      {/* Grease-pencil route connecting the scene nodes in order. */}
      <polyline points={path} className="route-map-route" fill="none" />
      {nodes.map((node) => {
        const cleared = clearedSceneIds.includes(node.id);
        const current = node.id === currentSceneId;
        const state = cleared ? "cleared" : current ? "current" : "upcoming";
        return (
          <g key={node.id} transform={`translate(${node.mapX} ${node.mapY})`}>
            <circle
              r={state === "current" ? 5 : 4}
              className={`route-map-node route-map-node--${state}`}
            />
            {cleared && (
              <>
                <line x1={-3} y1={-3} x2={3} y2={3} className="route-map-cross" />
                <line x1={-3} y1={3} x2={3} y2={-3} className="route-map-cross" />
              </>
            )}
            <text x={0} y={9} textAnchor="middle" className="route-map-label">
              {node.index}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
