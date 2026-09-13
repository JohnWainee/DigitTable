import { act, renderHook } from "@testing-library/react";
import { THREAT_ID } from "@digitable/template-eat-the-reich";
import { describe, expect, it } from "vitest";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";
import { useGmFlow } from "../../src/gm/useGmFlow.js";

describe("useGmFlow", () => {
  it("submits opposition through the shared repository and reflects the resulting projection", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const rollId = repository.getGmProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    const { result } = renderHook(() => useGmFlow(repository));

    act(() => {
      result.current.submitOpposition(rollId, 1);
    });

    expect(result.current.projection.view.activeRoll?.status).toBe("awaiting_allocation");
    expect(result.current.errorMessage).toBeNull();
  });

  it("surfaces a rejected dispatch instead of failing silently", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, "strong-arm-the-enforcer", []);
    const rollId = repository.getGmProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    const { result } = renderHook(() => useGmFlow(repository));

    act(() => {
      // Out of the template's valid 0..MAX_PUSH_DICE range — unreachable through the real
      // stepper UI, which is exactly why this is exercised at the hook level.
      result.current.submitOpposition(rollId, 99);
    });

    expect(result.current.errorMessage).toMatch(/push dice/i);
    // The roll itself is untouched: a rejected command never mutates the shared room.
    expect(repository.getGmProjection().view.activeRoll?.status).toBe("awaiting_opposition");
  });
});
