export interface LiveRegionProps {
  readonly politeness: "polite" | "assertive";
  readonly message: string;
}

/**
 * A visible, announced status line. Ordinary results use "polite"; only
 * safety interrupts (out of scope for this local player-only slice) would
 * use "assertive" (docs/UX_RESOLUTION_THEATRE.md).
 */
export function LiveRegion({ politeness, message }: LiveRegionProps): JSX.Element {
  return (
    <p aria-live={politeness} role="status" className="live-region">
      {message}
    </p>
  );
}
