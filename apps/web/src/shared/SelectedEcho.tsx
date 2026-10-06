/**
 * The full text of what a native `<select>` currently shows. A closed select cannot wrap, so on a
 * phone a long option ("Objective: Get clear of the wreckage and into the streets") is ellipsised
 * and the person loses which entry they picked. This prints it, wrapped, directly under the control.
 * `aria-hidden`: the select already announces its own value; this is for sighted, low-vision and
 * large-text readers, and must never double what a screen reader says.
 */
export function SelectedEcho({ text }: { readonly text: string | null }): JSX.Element | null {
  if (text === null || text === "") return null;
  return (
    <p className="select-echo" aria-hidden="true" data-testid="select-echo">
      {text}
    </p>
  );
}
