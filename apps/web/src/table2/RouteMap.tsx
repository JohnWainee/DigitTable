export interface RouteMapProps {
  readonly currentSceneId: string | null;
  readonly clearedSceneIds: readonly string[];
}

/**
 * The four `ORIGINAL_MISSION` scenes (templates/eat-the-reich/src/scenes.ts)
 * in mission order, with this map's own fixed layout coordinates (a
 * schematic route across Paris, not a real map). `id` matches every other
 * scene-id-keyed asset in this app (`SceneArt`'s manifest, the real
 * engine's `sceneId`).
 */
export const ROUTE_MAP_SCENE_ORDER: readonly string[] = [
  "drop-forecourt",
  "metro-platform",
  "printworks",
  "signal-mast",
];

const ROUTE_MAP_NODES: readonly {
  readonly id: string;
  readonly index: number;
  readonly location: string;
  readonly mapX: number;
  readonly mapY: number;
}[] = [
  { id: "drop-forecourt", index: 1, location: "The Gare des Ombres", mapX: 12, mapY: 82 },
  { id: "metro-platform", index: 2, location: "The abandoned Métro platform", mapX: 38, mapY: 58 },
  { id: "printworks", index: 3, location: "The printworks", mapX: 62, mapY: 38 },
  { id: "signal-mast", index: 4, location: "The signal mast", mapX: 88, mapY: 14 },
];

/**
 * docs/ETR_SESSION_FLOW.md section 10 / F05 P1: an original, schematic
 * Paris route map, code-drawn SVG. No tactical movement, no line-of-sight,
 * no measuring — just the four scene nodes, the river, three concentric
 * "sector" rings marking distance-to-objective bands, and each node's
 * state (a rotated CLEARED stamp once a scene's primary Objective is
 * complete, replacing the earlier plain cross-out). `prefers-reduced-
 * motion` disables the current-node pulse (CSS only).
 */
export function RouteMap({ currentSceneId, clearedSceneIds }: RouteMapProps): JSX.Element {
  const nodes = ROUTE_MAP_NODES;
  const path = nodes.map((n) => `${n.mapX},${n.mapY}`).join(" ");
  const currentLabel = nodes.find((n) => n.id === currentSceneId)?.location ?? "not yet loaded";

  return (
    <svg
      viewBox="0 0 100 100"
      className="route-map"
      role="img"
      aria-label={`Route map. Current scene: ${currentLabel}.`}
    >
      {/* Sector rings: three concentric distance-to-objective bands, centered on the final node. */}
      <g className="route-map-sectors" aria-hidden="true">
        <circle cx={88} cy={14} r={30} className="route-map-sector-ring" fill="none" />
        <circle cx={88} cy={14} r={55} className="route-map-sector-ring" fill="none" />
        <circle cx={88} cy={14} r={80} className="route-map-sector-ring" fill="none" />
      </g>
      {/* River: a single bezier band. */}
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
              <g className="route-map-cleared-stamp" transform="rotate(-18)">
                <rect x={-11} y={-3} width={22} height={6} rx={1} />
                <text x={0} y={1.8} textAnchor="middle">
                  CLEARED
                </text>
              </g>
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
