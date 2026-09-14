import { act, renderHook, waitFor } from "@testing-library/react";
import { asCommandId, type CommandId } from "@digitable/contracts";
import { THREAT_ID } from "@digitable/template-eat-the-reich";
import { describe, expect, it } from "vitest";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";
import { useGmFlow } from "../../src/gm/useGmFlow.js";

function newCommandId(): CommandId {
  return asCommandId(globalThis.crypto.randomUUID());
}

describe("useGmFlow", () => {
  it("submits opposition through the shared repository and reflects the resulting projection", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    const rollId = repository.getGmProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    const { result } = renderHook(() => useGmFlow(repository));

    act(() => {
      result.current.submitOpposition(rollId, 1);
    });

    await waitFor(() =>
      expect(result.current.projection.view.activeRoll?.status).toBe("awaiting_allocation"),
    );
    expect(result.current.errorMessage).toBeNull();
  });

  it("surfaces a rejected dispatch instead of failing silently", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, "strong-arm-the-enforcer", []);
    const rollId = repository.getGmProjection().view.activeRoll?.rollId;
    if (!rollId) throw new Error("expected an active roll");

    const { result } = renderHook(() => useGmFlow(repository));

    act(() => {
      // Out of the template's valid 0..MAX_PUSH_DICE range — unreachable through the real
      // stepper UI, which is exactly why this is exercised at the hook level.
      result.current.submitOpposition(rollId, 99);
    });

    await waitFor(() => expect(result.current.errorMessage).toMatch(/push dice/i));
    // The roll itself is untouched: a rejected command never mutates the shared room.
    expect(repository.getGmProjection().view.activeRoll?.status).toBe("awaiting_opposition");
  });
});
