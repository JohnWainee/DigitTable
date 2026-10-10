import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateOriginalContentSentinelsFlat } from "./private-original-content-sentinels.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const assetRoot = join(repoRoot, "apps/web/dist/assets");
const assets = (await readdir(assetRoot))
  .filter((name) => /\.(?:js|css|map)$/.test(name))
  .map((name) => join(assetRoot, name));
if (assets.length === 0) throw new Error("No built web assets were found to inspect.");

for (const asset of assets) {
  const contents = await readFile(asset, "utf8");
  const leaked = privateOriginalContentSentinelsFlat.find((sentinel) =>
    contents.includes(sentinel),
  );
  if (leaked) {
    throw new Error(`Private original encounter content was bundled into ${asset}: ${leaked}`);
  }
}
console.log(`Checked ${assets.length} web assets for private original encounter content.`);
