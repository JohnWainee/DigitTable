import spriteMarkup from "../assets/etr-icons.svg?raw";

/**
 * Mounts the etr-icons.svg sprite (docs/ETR_ART_BRIEF.md section 3.5) once
 * per page so `<Icon name="..." />` can reference its `<symbol>`s via
 * `<use href="#etr-icon-...">`. Rendered hidden; every icon is decorative,
 * so this element itself carries no label — the label comes from
 * whatever uses `Icon`.
 */
export function IconSprite(): JSX.Element {
  return (
    <div
      style={{ display: "none" }}
      aria-hidden="true"
      // Static, build-time-bundled SVG markup (not user input).
      dangerouslySetInnerHTML={{ __html: spriteMarkup }}
    />
  );
}
