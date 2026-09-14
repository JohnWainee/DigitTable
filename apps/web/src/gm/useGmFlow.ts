import { useCallback, useEffect, useState } from "react";
import { asCommandId } from "@digitable/contracts";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";

export interface GmFlow {
  readonly projection: ReturnType<InMemoryRoomRepository["getGmProjection"]>;
  readonly errorMessage: string | null;
  readonly submitOpposition: (rollId: string, pushDice: number) => void;
}

/**
 * Drives the GM half of the shared opposed-action flow
 * (docs/PHASE_1C_PLAN.md, "GM opposition controls"): reads the GM's own
 * `ViewerProjection` off the shared repository and submits `SubmitOpposition`
 * through the exact same dispatch path the player's controls use — no
 * parallel command-execution code path.
 */
export function useGmFlow(repository: InMemoryRoomRepository): GmFlow {
  const [projection, setProjection] = useState(() => repository.getGmProjection());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return repository.subscribe(() => setProjection(repository.getGmProjection()));
  }, [repository]);

  const submitOpposition = useCallback(
    (rollId: string, pushDice: number) => {
      setErrorMessage(null);
      const commandId = asCommandId(globalThis.crypto.randomUUID());
      void repository.submitOpposition(commandId, rollId, pushDice).then((result) => {
        if (result.status === "rejected") {
          setErrorMessage(result.message);
        }
      });
    },
    [repository],
  );

  return { projection, errorMessage, submitOpposition };
}
