import type { ReactNode } from "react";

export interface SelectedOptionEchoProps {
  /** `id` of the native `<select>` this echoes; the real-browser audit pairs them by it. */
  readonly selectId: string;
  /** The chosen option's full label. */
  readonly children: ReactNode;
}

/**
 * The chosen option of a native `<select>`, written out in full beside it. A closed select ellipsises
 * its value to stay inside a narrow phone column (it cannot wrap), which can cut off the part of a
 * label that tells two options apart ("Threat: Station Patrol A" and "...B" both reading
 * "Threat: Station Pat…"). The option popup itself is owned by the browser or OS and is never clipped;
 * this only restores the context the closed control hides.
 *
 * Decorative: the select already exposes its full value to assistive technology, so it is hidden from
 * the accessibility tree rather than read twice. Presentation only; it holds no state.
 */
export function SelectedOptionEcho({ selectId, children }: SelectedOptionEchoProps): JSX.Element {
  return (
    <p className="select-echo" data-select-echo-for={selectId} aria-hidden="true">
      <span className="select-echo-label">Selected</span> {children}
    </p>
  );
}
