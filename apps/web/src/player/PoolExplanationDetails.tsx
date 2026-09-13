import type { PoolExplanation } from "@digitable/contracts";

export interface PoolExplanationDetailsProps {
  readonly pool: PoolExplanation;
}

/**
 * The "Why?" disclosure (docs/EAT_THE_REICH_BUILD_GUIDE.md player flow:
 * "Review a compact pool; expand 'Why?' for its derivation"). `<details>` is
 * natively keyboard-operable and exposes its expanded state to assistive
 * technology without any bespoke ARIA.
 */
export function PoolExplanationDetails({ pool }: PoolExplanationDetailsProps): JSX.Element {
  return (
    <div className="pool-summary">
      <p>
        Pool: <strong>{pool.total}</strong> {pool.total === 1 ? "die" : "dice"} (needs{" "}
        {pool.successThreshold}+ on a d{pool.diceSides})
      </p>
      <details>
        <summary>Why?</summary>
        <ul>
          {pool.components.map((component) => (
            <li key={component.label}>
              {component.label}: {component.value}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
