import { useId, useState } from "react";
import { SheetDialog } from "./SheetDialog.js";

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

export interface OptionPickerProps {
  /** Visible field label; also the picker sheet's title, so the control being changed stays on screen. */
  readonly label: string;
  readonly value: string;
  readonly options: readonly PickerOption[];
  readonly onChange: (value: string) => void;
  /** Shown on the closed control when `value` matches no option. */
  readonly placeholder?: string;
  /** Stable id for the trigger, so tests and the audit can find the control. */
  readonly id: string;
}

/**
 * Replacement for a native `<select>`. The closed control is a full-width button showing the current
 * choice; opening it presents every option in the shared `SheetDialog` (bottom sheet on a phone,
 * centred card on a wide screen), so the list is always inside the visual viewport, scrolls
 * internally, has 48px rows that wrap long text, keeps the field name and current choice visible,
 * and inherits the sheet's inert background, focus trap, Escape and safe-area handling. A native
 * popup cannot be sized, audited or screenshotted by the page. Choosing an option commits and closes.
 *
 * Presentation only: it holds no domain state beyond whether the list is open.
 */
export function OptionPicker({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose one…",
  id,
}: OptionPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const current = options.find((option) => option.value === value);
  const currentText = current?.label ?? placeholder;

  return (
    <div className="form-field option-picker">
      <span className="option-picker-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className="picker-trigger"
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}-value`}
        data-value={value}
        onClick={() => setOpen(true)}
      >
        <span id={`${id}-value`} className="picker-trigger-value">
          {currentText}
        </span>
      </button>
      {open && (
        <SheetDialog
          titleId={titleId}
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <div className="sheet-actions">
              <button type="button" className="secondary-action" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <p className="picker-current">
            Current: <strong>{currentText}</strong>
          </p>
          <ul className="picker-options">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    className="picker-option"
                    data-value={option.value}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      if (!selected) onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {selected && (
                      <span className="picker-option-mark" aria-hidden="true">
                        Selected
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetDialog>
      )}
    </div>
  );
}
