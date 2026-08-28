import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pluginsDirectory = path.join(root, "plugins");
const indexPath = path.join(root, "index.json");
const privateKeyText = process.env.MARKETPLACE_ED25519_PRIVATE_KEY || process.env.SECAGENT_MARKET_PRIVATE_KEY;
const githubToken = process.env.GITHUB_TOKEN || process.env.MARKETPLACE_GITHUB_TOKEN;

if (!privateKeyText) {
  throw new Error("Set MARKETPLACE_ED25519_PRIVATE_KEY to the official Ed25519 private key PEM.");
}
if (!githubToken) {
  throw new Error("Set GITHUB_TOKEN to resolve GitHub Release metadata during index generation.");
}

const pluginFiles = fs.readdirSync(pluginsDirectory)
  .filter((file) => file.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));
if (!pluginFiles.length) throw new Error("No plugin metadata files found.");

const plugins = [];
for (const file of pluginFiles) {
  const filePath = path.join(pluginsDirectory, file);
  const bytes = fs.readFileSync(filePath);
  const metadata = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (metadata.schemaVersion !== 1 || typeof metadata.id !== "string" || `${metadata.id}.json` !== file) {
    throw new Error(`Invalid plugin metadata or filename: ${file}`);
  }
  const latest = await resolveLatestRelease(metadata);
  plugins.push({
    id: metadata.id,
    path: `plugins/${file}`,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    latest
  });
  console.log(`Resolved ${metadata.id} ${latest.version}.`);
}

const unsigned = {
  schemaVersion: 2,
  generatedAt: process.env.MARKETPLACE_GENERATED_AT || new Date().toISOString(),
  plugins
};
const signature = crypto.sign(null, Buffer.from(canonicalize(unsigned), "utf8"), crypto.createPrivateKey(privateKeyText)).toString("base64");
fs.writeFileSync(indexPath, `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`, "utf8");
console.log(`Generated ${path.relative(root, indexPath)} with ${plugins.length} plugins.`);

async function resolveLatestRelease(metadata) {
  const spec = metadata.release;
  if (!spec || spec.provider !== "github" || typeof spec.owner !== "string" || typeof spec.repo !== "string" || typeof spec.assetName !== "string") {
    throw new Error(`Invalid GitHub release spec: ${metadata.id}`);
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}/releases/latest`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "SecAgent-marketplace-generator",
      Authorization: `Bearer ${githubToken}`
    }
  });
  if (!response.ok) throw new Error(`GitHub Release lookup failed for ${metadata.id}: HTTP ${response.status}`);
  const release = await response.json();
  if (release.draft === true || (release.prerelease === true && spec.includePrerelease !== true)) {
    throw new Error(`Latest GitHub Release is not eligible for ${metadata.id}`);
  }

  const rawTag = typeof release.tag_name === "string" ? release.tag_name : "";
  const version = normalizeVersion(rawTag);
  if (!version || (version.includes("-") && spec.includePrerelease !== true)) {
    throw new Error(`Latest GitHub Release tag is not a usable SemVer for ${metadata.id}: ${rawTag}`);
  }

  const assets = Array.isArray(release.assets) ? release.assets.filter(isReleaseAsset) : [];
  const names = new Set([
    spec.assetName.replace("{version}", version),
    spec.assetName.replace("{version}", rawTag)
  ]);
  const asset = assets.find((candidate) => names.has(candidate.name));
  if (!asset) throw new Error(`GitHub Release is missing ${spec.assetName} for ${metadata.id}`);

  const assetUrl = asset.browser_download_url;
  let sha256 = parseSha256(asset.digest);
  if (!sha256) {
    const assetResponse = await fetch(assetUrl, {
      headers: { Accept: "application/octet-stream", "User-Agent": "SecAgent-marketplace-generator" }
    });
    if (!assetResponse.ok) throw new Error(`GitHub asset download failed for ${metadata.id}: HTTP ${assetResponse.status}`);
    sha256 = crypto.createHash("sha256").update(Buffer.from(await assetResponse.arrayBuffer())).digest("hex");
  }

  return {
    version,
    minHostApiVersion: metadata.minHostApiVersion,
    assetUrl,
    sha256,
    permissions: metadata.permissions,
    platforms: metadata.platforms
  };
}

function isReleaseAsset(value) {
  return value && typeof value.name === "string" && typeof value.browser_download_url === "string";
}

function parseSha256(value) {
  const match = typeof value === "string" ? value.match(/^sha256:([a-fA-F0-9]{64})$/i) : undefined;
  return match?.[1]?.toLowerCase();
}

function normalizeVersion(tag) {
  const value = tag.trim().replace(/^v/i, "");
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
    ? value
    : undefined;
}

function canonicalize(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
