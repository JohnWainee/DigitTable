import { expect } from "vitest";

export interface HeadingEntry {
  readonly level: number;
  readonly text: string;
}

/** Document-order outline of every `<h1>`-`<h6>`, the same list a screen reader's heading navigation walks. */
export function headingOutline(root: ParentNode = document.body): readonly HeadingEntry[] {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).map(
    (heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? "").replace(/\s+/g, " ").trim(),
    }),
  );
}

/**
 * The structure heading navigation relies on: exactly one page-level `h1`,
 * reached first, and no level skipped on the way down (h1 -> h3 without an
 * h2 breaks "jump to next h2" for a screen-reader user).
 */
export function expectNavigableHeadingOutline(root: ParentNode = document.body): void {
  const outline = headingOutline(root);
  expect(outline.length, "page has at least one heading").toBeGreaterThan(0);
  expect(
    outline.filter((h) => h.level === 1),
    `exactly one h1 in ${JSON.stringify(outline)}`,
  ).toHaveLength(1);
  expect(outline[0]?.level, `first heading is the h1 in ${JSON.stringify(outline)}`).toBe(1);
  outline.forEach((heading, index) => {
    if (index === 0) return;
    const previous = outline[index - 1]!;
    expect(
      heading.level,
      `"${heading.text}" (h${heading.level}) skips a level after "${previous.text}" (h${previous.level})`,
    ).toBeLessThanOrEqual(previous.level + 1);
  });
}
