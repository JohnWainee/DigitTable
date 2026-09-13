import { useEffect, useState } from "react";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";

/**
 * Reads the read-only shared-table projection off the shared repository
 * (docs/PHASE_1C_PLAN.md, "Shared-table projection"). The table surface
 * issues no commands, so this hook exposes no dispatch function at all.
 */
export function useTableProjection(
  repository: InMemoryRoomRepository,
): ReturnType<InMemoryRoomRepository["getTableProjection"]> {
  const [projection, setProjection] = useState(() => repository.getTableProjection());

  useEffect(() => {
    return repository.subscribe(() => setProjection(repository.getTableProjection()));
  }, [repository]);

  return projection;
}
