import { LandingScreen } from "./landing/LandingScreen.js";
import { CreateSessionScreen } from "./landing/CreateSessionScreen.js";
import { JoinScreen } from "./landing/JoinScreen.js";
import { JoinTableScreen } from "./landing/JoinTableScreen.js";
import { ClaimCharacterScreen } from "./landing/ClaimCharacterScreen.js";
import { PlayerDashboardScreen } from "./player2/PlayerDashboardScreen.js";
import { GmDirectorScreen } from "./gm2/GmDirectorScreen.js";
import { TableDashboardScreen } from "./table2/TableDashboardScreen.js";
import { useRoute } from "./router.js";
import { IconSprite } from "./shared/IconSprite.js";
import { useDocumentTitle } from "./shell/documentTitle.js";
import "./styles.css";

/**
 * C06 (issue #14): the Phase 1C tab-switcher demo (`/demo`) and its
 * single-room `InMemoryRoomRepository` fixed-member simulation are retired
 * — B02-B05 replaced the placeholder template it depended on wholesale
 * (single "nerve" stat, `SubmitOpposition`, one fixed character), so it no
 * longer compiles against the real engine and has no remaining purpose:
 * every screen below now runs the same real engine, live or in fixture
 * mode, behind `apps/web/src/session/roomClient.ts`'s bootstrap seam.
 */
export function App(): JSX.Element {
  const route = useRoute();
  useDocumentTitle();

  return (
    <>
      <IconSprite />
      <RouteScreen route={route} />
    </>
  );
}

function RouteScreen({ route }: { readonly route: ReturnType<typeof useRoute> }): JSX.Element {
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
    case "gm":
      return <GmDirectorScreen roomId={route.roomId} />;
    case "table":
      return <TableDashboardScreen roomId={route.roomId} />;
    default:
      return <LandingScreen />;
  }
}
