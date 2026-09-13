import { useState } from "react";
import { usePrefersReducedMotion } from "./accessibility/usePrefersReducedMotion.js";
import { PlayerScreen } from "./player/PlayerScreen.js";
import { InMemoryRoomRepository } from "./repository/InMemoryRoomRepository.js";
import "./styles.css";

export function App(): JSX.Element {
  const [repository] = useState(() => new InMemoryRoomRepository());
  const reducedMotion = usePrefersReducedMotion();
  return <PlayerScreen repository={repository} reducedMotion={reducedMotion} />;
}
