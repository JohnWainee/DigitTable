/**
 * Full text of what a native `<select>` currently has chosen. The closed control ellipsises long
 * option text (and a phone at large text sizes shows only a few characters of it), so the choice
 * would otherwise be unreadable once the OS picker closes. Visual only: the `<select>` itself still
 * carries the accessible value, so this is hidden from assistive technology rather than read twice.
 */
export function SelectedEcho({ text }: { readonly text: string }): JSX.Element | null {
  if (text === "") return null;
  return (
    <p className="select-echo" aria-hidden="true">
      <span className="select-echo-label">Picked</span> {text}
    </p>
  );
}
