export type IconName =
  | "stat-brawl"
  | "stat-con"
  | "stat-fix"
  | "stat-search"
  | "stat-shoot"
  | "stat-sneak"
  | "stat-terrify"
  | "blood"
  | "injury-empty"
  | "injury-marked"
  | "downed"
  | "die-discard"
  | "die-success"
  | "die-critical"
  | "objective"
  | "threat"
  | "challenge"
  | "attack"
  | "round"
  | "paused"
  | "online"
  | "offline";

/** Same order as `@digitable/template-eat-the-reich`'s `STATS` (BRAWL/CON/FIX/SEARCH/SHOOT/SNEAK/TERRIFY). */
export const STAT_ICON_NAMES: readonly IconName[] = [
  "stat-brawl",
  "stat-con",
  "stat-fix",
  "stat-search",
  "stat-shoot",
  "stat-sneak",
  "stat-terrify",
];

/** Human-readable labels, same order as `STAT_ICON_NAMES`/`STATS`. */
export const STAT_LABELS: readonly string[] = [
  "Brawl",
  "Con",
  "Fix",
  "Search",
  "Shoot",
  "Sneak",
  "Terrify",
];

export interface IconProps {
  readonly name: IconName;
  /** Purely decorative by default (the surrounding text/aria-label carries meaning); pass a label only when the icon stands alone. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * docs/ETR_ART_BRIEF.md section 3.5: renders one `<symbol>` from the
 * `etr-icons.svg` sprite (mounted once by `IconSprite`). currentColor by
 * default, so it inherits the surrounding text color; size with CSS
 * (`width`/`height`/`font-size`), not props.
 */
export function Icon({ name, label, className }: IconProps): JSX.Element {
  return (
    <svg
      className={className ? `etr-icon ${className}` : "etr-icon"}
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <use href={`#etr-icon-${name}`} />
    </svg>
  );
}
