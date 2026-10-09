import { useLayoutEffect, useRef, useState } from "react";
import type {
  CharacterCorrectionPatch,
  CharacterFullSheet,
} from "@digitable/template-eat-the-reich";
import { SheetDialog } from "../shared/SheetDialog.js";

export interface CorrectionDialogProps {
  readonly character: CharacterFullSheet;
  readonly onApply: (patch: CharacterCorrectionPatch, reason: string) => void;
  readonly onClose: () => void;
}

/**
 * One item's remaining-uses stepper. Tapping a button until its bound is reached disables that very
 * button, and a disabled control cannot keep focus: the browser drops it to the page, stranding a
 * keyboard or screen-reader user outside the sheet. Focus is therefore handed to the opposite
 * button once the new value has rendered (in a layout effect, before the browser's next frame):
 * only then is that button certainly enabled, even for a one-use item where it was disabled at the
 * moment of the tap.
 */
function UsesStepper({
  name,
  value,
  max,
  onChange,
}: {
  readonly name: string;
  readonly value: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
}): JSX.Element {
  const decrease = useRef<HTMLButtonElement>(null);
  const increase = useRef<HTMLButtonElement>(null);
  const handOffTo = useRef<"increase" | "decrease" | null>(null);
  useLayoutEffect(() => {
    if (handOffTo.current === null) return;
    (handOffTo.current === "increase" ? increase : decrease).current?.focus();
    handOffTo.current = null;
  });
  function step(delta: -1 | 1): void {
    const next = Math.max(0, Math.min(max, value + delta));
    if (next === 0 && max > 0) handOffTo.current = "increase";
    else if (next === max) handOffTo.current = "decrease";
    onChange(next);
  }
  return (
    <div role="group" aria-label={`${name} uses`} className="form-field">
      <span>{name}</span>
      <div className="stepper-controls">
        <button
          type="button"
          ref={decrease}
          aria-label={`Decrease ${name} uses`}
          disabled={value <= 0}
          onClick={() => step(-1)}
        >
          −
        </button>
        <span className="stepper-value">
          {value}/{max}
        </span>
        <button
          type="button"
          ref={increase}
          aria-label={`Increase ${name} uses`}
          disabled={value >= max}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * docs/ETR_SESSION_FLOW.md section 7: `CorrectCharacter` — bounded,
 * reason-required. c07 P1: extended beyond Blood-only to every field the
 * real `CharacterCorrectionPatch` allows (item uses, injury boxes,
 * downed, retired) — only the fields the GM actually touches are ever
 * included in the patch, matching `decide`'s "every field is optional;
 * only the ones present are changed" contract.
 *
 * Accessibility (C05, hardened after independent review — see
 * docs/reviews/2026-09-15-etr-screens-independent-review.md): focus moves
 * into the dialog on open and returns to whatever triggered it on close;
 * Escape closes it; Tab is trapped inside the dialog while it's open (a
 * keyboard user can no longer tab into the console behind it); the Blood
 * preview is a polite live region; the stepper is grouped under one
 * accessible label instead of a `<label>` pointing at a non-control
 * `<span>`. Those behaviours, plus the reskin's mobile bottom-sheet sizing
 * (visual-viewport aware, pinned header/footer, internal scroll, inert
 * background), now live in the shared `SheetDialog`.
 */
export function CorrectionDialog({
  character,
  onApply,
  onClose,
}: CorrectionDialogProps): JSX.Element {
  const [bloodDelta, setBloodDelta] = useState(0);
  const [itemUses, setItemUses] = useState<Record<string, number>>({});
  const [boxOverrides, setBoxOverrides] = useState<Record<string, boolean>>({});
  const [downed, setDowned] = useState(character.downed);
  const [retired, setRetired] = useState(character.retired);
  const [reason, setReason] = useState("");
  const nextBlood = Math.max(0, Math.min(10, character.blood + bloodDelta));

  function toggleBox(categoryId: string, boxIndex: 0 | 1, currentlyMarked: boolean): void {
    const key = `${categoryId}:${boxIndex}`;
    setBoxOverrides((prev) => {
      const next = { ...prev };
      // Toggling twice returns to "no override" rather than accumulating.
      if (key in next && next[key] === !currentlyMarked) {
        delete next[key];
      } else {
        next[key] = !currentlyMarked;
      }
      return next;
    });
  }

  const itemUsesChanged = Object.entries(itemUses).some(
    ([itemId, uses]) => uses !== character.items.find((i) => i.id === itemId)?.usesRemaining,
  );
  const boxesChanged = Object.keys(boxOverrides).length > 0;
  const downedChanged = downed !== character.downed;
  const retiredChanged = retired !== character.retired;
  const bloodChanged = bloodDelta !== 0;
  const anyChange =
    bloodChanged || itemUsesChanged || boxesChanged || downedChanged || retiredChanged;
  const canApply = reason.trim().length > 0 && anyChange;

  function handleApply(): void {
    const patch: {
      blood?: number;
      downed?: boolean;
      retired?: boolean;
      itemUses?: { readonly itemId: string; readonly usesRemaining: number }[];
      injuryBoxes?: {
        readonly categoryId: string;
        readonly boxIndex: 0 | 1;
        readonly marked: boolean;
      }[];
    } = {};
    if (bloodChanged) patch.blood = nextBlood;
    if (downedChanged) patch.downed = downed;
    if (retiredChanged) patch.retired = retired;
    if (itemUsesChanged) {
      patch.itemUses = Object.entries(itemUses)
        .filter(
          ([itemId, uses]) => uses !== character.items.find((i) => i.id === itemId)?.usesRemaining,
        )
        .map(([itemId, usesRemaining]) => ({ itemId, usesRemaining }));
    }
    if (boxesChanged) {
      patch.injuryBoxes = Object.entries(boxOverrides).map(([key, marked]) => {
        const [categoryId, boxIndexStr] = key.split(":");
        return { categoryId: categoryId!, boxIndex: Number(boxIndexStr) as 0 | 1, marked };
      });
    }
    onApply(patch, reason);
  }

  return (
    <SheetDialog
      titleId="correction-heading"
      title={`Correct ${character.name}`}
      onClose={onClose}
      footer={
        <div className="landing-actions sheet-actions">
          <button
            type="button"
            className="primary-action"
            disabled={!canApply}
            onClick={handleApply}
          >
            Apply correction
          </button>
          <button type="button" className="secondary-action" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <div className="form-field">
        <div role="group" aria-labelledby="correction-delta-label">
          <span id="correction-delta-label">Blood change</span>
          <div className="stepper-controls">
            <button
              type="button"
              onClick={() => setBloodDelta((d) => d - 1)}
              aria-label="Decrease Blood change"
            >
              −
            </button>
            <span className="stepper-value">{bloodDelta > 0 ? `+${bloodDelta}` : bloodDelta}</span>
            <button
              type="button"
              onClick={() => setBloodDelta((d) => d + 1)}
              aria-label="Increase Blood change"
            >
              +
            </button>
          </div>
        </div>
        <p className="form-hint" role="status" aria-live="polite">
          Blood {character.blood} &rarr; {nextBlood}
        </p>
      </div>

      {character.items.length > 0 && (
        <fieldset>
          <legend>Item uses</legend>
          {character.items.map((item) => {
            const value = itemUses[item.id] ?? item.usesRemaining;
            return (
              <UsesStepper
                key={item.id}
                name={item.name}
                value={value}
                max={item.maxUses}
                onChange={(next) => setItemUses((prev) => ({ ...prev, [item.id]: next }))}
              />
            );
          })}
        </fieldset>
      )}

      {character.injuries.length > 0 && (
        <fieldset>
          <legend>Injury boxes</legend>
          {character.injuries.map((category) => (
            <div key={category.id} className="gear-list">
              <span>{category.label}</span>
              {category.boxes.map((box, boxIndex) => {
                const key = `${category.id}:${boxIndex}`;
                const marked = key in boxOverrides ? boxOverrides[key]! : box.marked;
                return (
                  <label key={boxIndex} className="gear-option">
                    <input
                      type="checkbox"
                      checked={marked}
                      onChange={() => toggleBox(category.id, boxIndex as 0 | 1, box.marked)}
                    />
                    Box {boxIndex + 1}
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}

      <fieldset>
        <legend>Status</legend>
        <label className="gear-option">
          <input type="checkbox" checked={downed} onChange={(e) => setDowned(e.target.checked)} />
          Downed
        </label>
        <label className="gear-option">
          <input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />
          Retired
        </label>
      </fieldset>

      <div className="form-field">
        <label htmlFor="correction-reason">Reason (required)</label>
        <input
          id="correction-reason"
          type="text"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </SheetDialog>
  );
}
