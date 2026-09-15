import { useState } from "react";
import type { CharacterFullSheet, RollView, RollViewFull } from "@digitable/template-eat-the-reich";

export interface GmToolsPanelProps {
  readonly gmSheets: readonly CharacterFullSheet[];
  readonly rolls: readonly RollView[];
  readonly onVoidRoll: (rollId: string, reason: string) => void;
  readonly onGrantItem: (
    characterId: string,
    item: {
      id: string;
      name: string;
      bonusRequirement: string;
      bonusPlus: number;
      maxUses: number;
    },
    reason: string | null,
  ) => void;
  readonly onUnlockAdvance: (characterId: string, advanceId: string, reason: string | null) => void;
  readonly onReassignCharacter: (
    characterId: string,
    memberId: string | null,
    reason: string | null,
  ) => void;
}

function isFullRoll(roll: RollView): roll is RollViewFull {
  return "declaredStat" in roll;
}

/**
 * docs/ETR_SESSION_FLOW.md section 7: the remaining GM commands
 * (`VoidRoll`/`GrantItem`/`UnlockAdvance`/`ReassignCharacter`) — wired
 * minimally (one compact form per command, no bespoke browsing UI) since
 * none of them are on the critical rules-visible path C06/C07 exist to
 * unblock, but a real session eventually needs each of them.
 */
export function GmToolsPanel({
  gmSheets,
  rolls,
  onVoidRoll,
  onGrantItem,
  onUnlockAdvance,
  onReassignCharacter,
}: GmToolsPanelProps): JSX.Element {
  const openRolls = rolls.filter(isFullRoll).filter((r) => r.status !== "resolved");
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});

  const [grantCharacterId, setGrantCharacterId] = useState(gmSheets[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [itemName, setItemName] = useState("");
  const [bonusRequirement, setBonusRequirement] = useState("");
  const [bonusPlus, setBonusPlus] = useState("1");
  const [maxUses, setMaxUses] = useState("3");
  const [grantReason, setGrantReason] = useState("");

  const [advanceCharacterId, setAdvanceCharacterId] = useState(gmSheets[0]?.id ?? "");
  const advanceCharacter = gmSheets.find((c) => c.id === advanceCharacterId);
  const [advanceId, setAdvanceId] = useState(advanceCharacter?.advances[0]?.id ?? "");
  const [advanceReason, setAdvanceReason] = useState("");

  const [reassignCharacterId, setReassignCharacterId] = useState(gmSheets[0]?.id ?? "");
  const [reassignMemberId, setReassignMemberId] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  return (
    <section className="step" aria-labelledby="gm-tools-heading">
      <h2 id="gm-tools-heading">GM tools</h2>

      {openRolls.length > 0 && (
        <fieldset>
          <legend>Void a roll</legend>
          {openRolls.map((roll) => {
            const character = gmSheets.find((c) => c.id === roll.characterId);
            const reasonValue = voidReasons[roll.rollId] ?? "";
            return (
              <div key={roll.rollId} className="form-field">
                <span>
                  {character?.name ?? roll.characterId} &mdash; {roll.status}
                </span>
                <label htmlFor={`void-reason-${roll.rollId}`}>Reason (required)</label>
                <input
                  id={`void-reason-${roll.rollId}`}
                  type="text"
                  value={reasonValue}
                  onChange={(e) =>
                    setVoidReasons((prev) => ({ ...prev, [roll.rollId]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="secondary-action"
                  disabled={reasonValue.trim() === ""}
                  onClick={() => {
                    onVoidRoll(roll.rollId, reasonValue);
                    setVoidReasons((prev) => ({ ...prev, [roll.rollId]: "" }));
                  }}
                >
                  Void this roll
                </button>
              </div>
            );
          })}
        </fieldset>
      )}

      <fieldset>
        <legend>Grant an item</legend>
        <label htmlFor="grant-character">Character</label>
        <select
          id="grant-character"
          value={grantCharacterId}
          onChange={(e) => setGrantCharacterId(e.target.value)}
        >
          {gmSheets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="form-field">
          <label htmlFor="grant-item-id">Item id</label>
          <input
            id="grant-item-id"
            type="text"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="grant-item-name">Name</label>
          <input
            id="grant-item-name"
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="grant-bonus-requirement">Bonus requirement</label>
          <input
            id="grant-bonus-requirement"
            type="text"
            value={bonusRequirement}
            onChange={(e) => setBonusRequirement(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="grant-bonus-plus">Bonus plus</label>
          <input
            id="grant-bonus-plus"
            type="number"
            min={0}
            max={4}
            value={bonusPlus}
            onChange={(e) => setBonusPlus(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="grant-max-uses">Max uses</label>
          <input
            id="grant-max-uses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="grant-reason">Reason</label>
          <input
            id="grant-reason"
            type="text"
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={itemId.trim() === "" || itemName.trim() === "" || !grantCharacterId}
          onClick={() => {
            onGrantItem(
              grantCharacterId,
              {
                id: itemId,
                name: itemName,
                bonusRequirement,
                bonusPlus: Number(bonusPlus) || 0,
                maxUses: Number(maxUses) || 1,
              },
              grantReason.trim() === "" ? null : grantReason,
            );
            setItemId("");
            setItemName("");
            setBonusRequirement("");
            setGrantReason("");
          }}
        >
          Grant item
        </button>
      </fieldset>

      {gmSheets.some((c) => c.advances.length > 0) && (
        <fieldset>
          <legend>Unlock an advance</legend>
          <label htmlFor="advance-character">Character</label>
          <select
            id="advance-character"
            value={advanceCharacterId}
            onChange={(e) => {
              setAdvanceCharacterId(e.target.value);
              const next = gmSheets.find((c) => c.id === e.target.value);
              setAdvanceId(next?.advances[0]?.id ?? "");
            }}
          >
            {gmSheets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label htmlFor="advance-select">Advance</label>
          <select
            id="advance-select"
            value={advanceId}
            onChange={(e) => setAdvanceId(e.target.value)}
          >
            {(advanceCharacter?.advances ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.unlocked ? " (already unlocked)" : ""}
              </option>
            ))}
          </select>
          <div className="form-field">
            <label htmlFor="advance-reason">Reason</label>
            <input
              id="advance-reason"
              type="text"
              value={advanceReason}
              onChange={(e) => setAdvanceReason(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="secondary-action"
            disabled={!advanceId}
            onClick={() => {
              onUnlockAdvance(
                advanceCharacterId,
                advanceId,
                advanceReason.trim() === "" ? null : advanceReason,
              );
              setAdvanceReason("");
            }}
          >
            Unlock advance
          </button>
        </fieldset>
      )}

      <fieldset>
        <legend>Reassign a character</legend>
        <label htmlFor="reassign-character">Character</label>
        <select
          id="reassign-character"
          value={reassignCharacterId}
          onChange={(e) => setReassignCharacterId(e.target.value)}
        >
          {gmSheets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="form-field">
          <label htmlFor="reassign-member-id">New member id (blank to unassign)</label>
          <input
            id="reassign-member-id"
            type="text"
            value={reassignMemberId}
            onChange={(e) => setReassignMemberId(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="reassign-reason">Reason</label>
          <input
            id="reassign-reason"
            type="text"
            value={reassignReason}
            onChange={(e) => setReassignReason(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            onReassignCharacter(
              reassignCharacterId,
              reassignMemberId.trim() === "" ? null : reassignMemberId,
              reassignReason.trim() === "" ? null : reassignReason,
            );
            setReassignMemberId("");
            setReassignReason("");
          }}
        >
          Reassign
        </button>
      </fieldset>
    </section>
  );
}
