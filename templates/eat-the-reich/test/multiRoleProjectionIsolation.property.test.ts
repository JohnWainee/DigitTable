import { asCommandId, checkProjectionBudget, type AuthorityRecord } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { findLeakedSecrets } from "@digitable/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_VIEWER,
  TABLE_VIEWER,
  freshAuthority,
  freshState,
} from "./fixtures.js";

function authorityWithSecretItemName(secretItemName: string): AuthorityRecord<EatTheReichState> {
  const state = freshState();
  const character = state.characters[ROOK_ID];
  if (!character) throw new Error("fixture missing rook");
  return freshAuthority({
    ...state,
    characters: {
      ...state.characters,
      [ROOK_ID]: {
        ...character,
        items: character.items.map((item, index) =>
          index === 0 ? { ...item, name: secretItemName } : item,
        ),
      },
    },
  });
}

/**
 * Asserts the four-viewer isolation invariant at once: only the claiming
 * player (`self`) and the GM (`gmSheets`) see a character's sheet detail;
 * another player and the table never do, even mid-lifecycle.
 */
function assertFourWayIsolation(
  authority: AuthorityRecord<EatTheReichState>,
  secretItemName: string,
  claimed: boolean,
): void {
  const playerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
  const otherPlayerProjection = projectViewer(eatTheReichTemplate, authority, SECOND_PLAYER_VIEWER);
  const gmProjection = projectViewer(eatTheReichTemplate, authority, GM_VIEWER);
  const tableProjection = projectViewer(eatTheReichTemplate, authority, TABLE_VIEWER);

  for (const projection of [
    playerProjection,
    otherPlayerProjection,
    gmProjection,
    tableProjection,
  ]) {
    expect(checkProjectionBudget(projection).withinCeiling).toBe(true);
  }

  expect(findLeakedSecrets(otherPlayerProjection.view, [secretItemName])).toEqual([]);
  expect(findLeakedSecrets(tableProjection.view, [secretItemName])).toEqual([]);
  expect(findLeakedSecrets(gmProjection.view, [secretItemName])).toEqual([secretItemName]);
  expect(findLeakedSecrets(playerProjection.view, [secretItemName])).toEqual(
    claimed ? [secretItemName] : [],
  );

  expect(gmProjection.view.self).toBeNull();
  expect(tableProjection.view.self).toBeNull();
  expect(otherPlayerProjection.view.self).toBeNull();
  expect(playerProjection.view.self?.id).toBe(claimed ? ROOK_ID : undefined);
}

describe("projection isolation across the character claim/heal/release flow (property)", () => {
  it("keeps four-way isolation intact at every step of ClaimCharacter -> HealInjury -> ReleaseCharacter", () => {
    fc.assert(
      fc.property(fc.hexaString({ minLength: 16, maxLength: 32 }), (secretItemName) => {
        let authority = authorityWithSecretItemName(secretItemName);
        assertFourWayIsolation(authority, secretItemName, false);

        const claim = runCommand(eatTheReichTemplate, {
          member: PLAYER_CTX,
          authority,
          random: createSeededRandom(`mr-claim-${secretItemName}`),
          command: { type: "ClaimCharacter", characterId: ROOK_ID },
          commandId: asCommandId("mr-cmd-claim"),
          occurredAtServer: "2026-09-14T00:00:00.000Z",
        });
        expect(claim.ok).toBe(true);
        if (!claim.ok) return;
        authority = claim.authority;
        assertFourWayIsolation(authority, secretItemName, true);

        // Mark an injury box directly (heal's only precondition, not itself under test here) then heal it.
        const claimedCharacter = authority.state.characters[ROOK_ID];
        if (!claimedCharacter) throw new Error("expected rook to be present");
        const categoryId = claimedCharacter.injuries[0]?.id;
        if (!categoryId) throw new Error("expected an injury category");
        authority = {
          ...authority,
          state: {
            ...authority.state,
            characters: {
              ...authority.state.characters,
              [ROOK_ID]: {
                ...claimedCharacter,
                blood: 5,
                injuries: claimedCharacter.injuries.map((c, i) =>
                  i === 0 ? { ...c, boxes: [{ marked: true }, c.boxes[1]] as typeof c.boxes } : c,
                ),
              },
            },
          },
        };
        assertFourWayIsolation(authority, secretItemName, true);

        const heal = runCommand(eatTheReichTemplate, {
          member: PLAYER_CTX,
          authority,
          random: createSeededRandom(`mr-heal-${secretItemName}`),
          command: { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
          commandId: asCommandId("mr-cmd-heal"),
          occurredAtServer: "2026-09-14T00:00:01.000Z",
        });
        expect(heal.ok).toBe(true);
        if (!heal.ok) return;
        authority = heal.authority;
        assertFourWayIsolation(authority, secretItemName, true);

        const release = runCommand(eatTheReichTemplate, {
          member: PLAYER_CTX,
          authority,
          random: createSeededRandom(`mr-release-${secretItemName}`),
          command: { type: "ReleaseCharacter", characterId: ROOK_ID },
          commandId: asCommandId("mr-cmd-release"),
          occurredAtServer: "2026-09-14T00:00:02.000Z",
        });
        expect(release.ok).toBe(true);
        if (!release.ok) return;
        authority = release.authority;
        assertFourWayIsolation(authority, secretItemName, false);
      }),
      { numRuns: 50 },
    );
  });
});
