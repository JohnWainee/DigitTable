import { useState } from "react";
import { GmScreen } from "./gm/GmScreen.js";
import { PlayerScreen } from "./player/PlayerScreen.js";
import { InMemoryRoomRepository } from "./repository/InMemoryRoomRepository.js";
import { TableScreen } from "./table/TableScreen.js";
import "./styles.css";

type Surface = "player" | "gm" | "table";

const SURFACES: readonly { readonly id: Surface; readonly label: string }[] = [
  { id: "player", label: "Player" },
  { id: "gm", label: "GM" },
  { id: "table", label: "Table" },
];

/**
 * Local multi-role simulation harness (docs/PHASE_1C_PLAN.md, "Local
 * in-memory command path"): one shared `InMemoryRoomRepository`, one
 * switchable surface per role. Real per-role routing/auth
 * (docs/ARCHITECTURE.md section 6's `/room/:roomId/{player,gm,table}`)
 * arrives with Phase 2's realtime room; this tab switcher stands in for it
 * locally so a single browser tab can exercise the full opposed-action flow
 * across all three roles against the one shared room.
 */
export function App(): JSX.Element {
  const [repository] = useState(() => new InMemoryRoomRepository());
  const [surface, setSurface] = useState<Surface>("player");

  return (
    <div className="app-shell">
      <nav aria-label="Surface" className="surface-switcher">
        {SURFACES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={surface === id}
            onClick={() => setSurface(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {surface === "player" && <PlayerScreen repository={repository} />}
      {surface === "gm" && <GmScreen repository={repository} />}
      {surface === "table" && <TableScreen repository={repository} />}
    </div>
  );
}
