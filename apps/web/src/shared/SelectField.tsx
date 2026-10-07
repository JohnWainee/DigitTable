import type { ChangeEvent, JSX } from "react";

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectFieldOption[];
  readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

/**
 * A native `<select>` plus a visible echo of the chosen option's full label.
 *
 * The browser owns the option popup (an OS picker on touch devices, an edge-aware popup on
 * desktop), so the list itself can never clip off-screen. What we own is the *closed* control, and
 * there a long label is ellipsised to keep the control inside a 320 px viewport ("The Abandoned
 * Métro Platf…"). The echo keeps the selected value readable and wraps, so the person never has to
 * reopen the picker to learn what is selected. It is `aria-hidden` visual help, not a description or live region: the select itself already
 * announces its value, and describing it would read the value twice.
 */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps): JSX.Element {
  const selected = options.find((option) => option.value === value);
  const echoId = `${id}-selected`;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p
        id={echoId}
        className="select-echo"
        aria-hidden="true"
        hidden={selected === undefined || value === ""}
      >
        <span className="select-echo-tag">Selected</span> {selected?.label}
      </p>
    </>
  );
}
