import { useState } from "react";
import { GmScreen } from "./gm/GmScreen.js";
import { PlayerScreen } from "./player/PlayerScreen.js";
import { InMemoryRoomRepository } from "./repository/InMemoryRoomRepository.js";
import { TableScreen } from "./table/TableScreen.js";
import { LandingScreen } from "./landing/LandingScreen.js";
import { CreateSessionScreen } from "./landing/CreateSessionScreen.js";
import { JoinScreen } from "./landing/JoinScreen.js";
import { JoinTableScreen } from "./landing/JoinTableScreen.js";
import { ClaimCharacterScreen } from "./landing/ClaimCharacterScreen.js";
import { PlayerDashboardScreen } from "./player2/PlayerDashboardScreen.js";
import { useRoute } from "./router.js";
import "./styles.css";

/**
 * `App` is now a small router over the screens named in
 * `docs/ETR_SESSION_FLOW.md` section 1 (C01: landing/create/join/claim/
 * table-join). The `/demo` route keeps the pre-existing Phase 1C tab
 * switcher available — it is the only surface with a working
 * compose->roll->allocate loop until C02/C03 land the real
 * `/room/:roomId/{player,gm,table}` routes wired to per-room state (A05).
 */
export function App(): JSX.Element {
  const route = useRoute();

  switch (route.name) {
    case "landing":
      return <LandingScreen />;
    case "create":
      return <CreateSessionScreen />;
    case "join":
      return <JoinScreen />;
    case "table-join":
      return <JoinTableScreen />;
    case "claim":
      return <ClaimCharacterScreen roomId={route.roomId} />;
    case "player":
      return <PlayerDashboardScreen roomId={route.roomId} />;
    case "demo":
      return <FixtureDemo />;
    default:
      return <LandingScreen />;
  }
}

type Surface = "player" | "gm" | "table";

const SURFACES: readonly { readonly id: Surface; readonly label: string }[] = [
  { id: "player", label: "Player" },
  { id: "gm", label: "GM" },
  { id: "table", label: "Table" },
];

/**
 * Local multi-role simulation harness (docs/PHASE_1C_PLAN.md, "Local
 * in-memory command path"): one shared `InMemoryRoomRepository`, one
 * switchable surface per role. Kept as the `/demo` route (see `App` doc)
 * until C02/C03's per-room screens replace it.
 */
function FixtureDemo(): JSX.Element {
  const [repository] = useState(() => new InMemoryRoomRepository());
  const [surface, setSurface] = useState<Surface>("player");

  return (
    <div className="app-shell">
      <p className="fixture-banner" role="note">
        Local fixture — not a live room. Nothing here leaves this browser tab.
      </p>
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
