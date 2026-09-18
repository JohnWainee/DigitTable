/**
 * Single source of truth for every `apps/web/public/etr/*.webp` URL the UI
 * requests. The provenance for each file lives in
 * `assets/generated/eat-the-reich/README.md`; `test/shared/artManifest.test.ts`
 * fails if any content id would request a file that does not exist.
 */
const BASE = "/etr";

export type SceneArtWidth = 640 | 1024 | 1536;

export function sceneArtSrc(sceneId: string, width: SceneArtWidth): string {
  return width === 640 ? `${BASE}/${sceneId}-640.webp` : `${BASE}/scene-${sceneId}-${width}.webp`;
}

export function portraitArtSrc(characterId: string, size: "card" | "token"): string {
  return size === "card"
    ? `${BASE}/${characterId}-512.webp`
    : `${BASE}/${characterId}-token-128.webp`;
}

/** Ordered: the first substring of the (lower-cased) engine threat id that matches picks the art. */
const THREAT_IMAGE_ID_BY_SUBSTRING: readonly (readonly [string, string])[] = [
  ["enforcer", "threat-enforcer"],
  ["warden", "threat-warden"],
  ["patrol", "threat-patrol"],
  ["rifle-squad", "threat-rifle-squad"],
  ["plated-squad", "threat-plated-squad"],
  ["marksman-nest", "threat-marksman-nest"],
  ["armoured-truck", "threat-armoured-truck"],
];

export function threatArtSrc(threatId: string): string | null {
  const lower = threatId.toLowerCase();
  for (const [needle, imageId] of THREAT_IMAGE_ID_BY_SUBSTRING) {
    if (lower.includes(needle)) return `${BASE}/${imageId}-128.webp`;
  }
  return null;
}

export const HERO_ART = {
  srcSet: `${BASE}/hero-600.webp 600w, ${BASE}/hero-1000.webp 1000w, ${BASE}/hero-1600.webp 1600w`,
  src: `${BASE}/hero-1000.webp`,
  alt: "Supernatural resistance figures watch moonlit Paris from a rain-slick rooftop.",
  width: 1672,
  height: 941,
} as const;
