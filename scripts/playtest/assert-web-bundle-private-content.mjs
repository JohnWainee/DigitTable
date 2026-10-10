import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const assetRoot = join(repoRoot, "apps/web/dist/assets");
const assets = (await readdir(assetRoot))
  .filter((name) => /\.(?:js|css|map)$/.test(name))
  .map((name) => join(assetRoot, name));
if (assets.length === 0) throw new Error("No built web assets were found to inspect.");

const privateCatalogSentinels = [
  "The Enforcer is unrevealed at load; RevealThreat it once round 2 begins.",
  "Foreshadow with slow, heavy footsteps down the tunnel before round 1 ends",
  "Loot: an ink-drum on a trolley (++ rolling downhill) is available via GrantItem",
  "The mission's final guardian. Foreshadow through the whole scene",
];
for (const asset of assets) {
  const contents = await readFile(asset, "utf8");
  const leaked = privateCatalogSentinels.find((sentinel) => contents.includes(sentinel));
  if (leaked) {
    throw new Error(`Private original encounter content was bundled into ${asset}: ${leaked}`);
  }
}
console.log(`Checked ${assets.length} web assets for private original encounter content.`);
