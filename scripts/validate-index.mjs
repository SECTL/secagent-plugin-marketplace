import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicKeyText = process.env.MARKETPLACE_ED25519_PUBLIC_KEY || process.env.SECAGENT_MARKET_PUBLIC_KEY;
if (!publicKeyText) throw new Error("Set MARKETPLACE_ED25519_PUBLIC_KEY to validate the signed index.");

const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8").replace(/^\uFEFF/, ""));
if (index.schemaVersion !== 2 || !Array.isArray(index.plugins) || typeof index.signature !== "string") throw new Error("Invalid schemaVersion 2 index.");
const unsigned = { schemaVersion: index.schemaVersion, generatedAt: index.generatedAt, plugins: index.plugins };
if (!crypto.verify(null, Buffer.from(canonicalize(unsigned), "utf8"), publicKeyText, Buffer.from(index.signature, "base64"))) throw new Error("Index signature verification failed.");

const seen = new Set();
for (const reference of index.plugins) {
  if (seen.has(reference.id)) throw new Error(`Duplicate plugin id: ${reference.id}`);
  seen.add(reference.id);
  const filePath = path.join(root, reference.path);
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256.toLowerCase() !== reference.sha256.toLowerCase()) throw new Error(`SHA-256 mismatch: ${reference.id}`);
  const metadata = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (metadata.schemaVersion !== 1 || metadata.id !== reference.id) throw new Error(`Invalid plugin metadata: ${reference.id}`);
  if (!isMarketplaceVersion(reference.latest)) throw new Error(`Missing or invalid resolved Release: ${reference.id}`);
}
console.log(`Validated ${index.plugins.length} signed plugin entries.`);

function isMarketplaceVersion(value) {
  return value
    && typeof value.version === "string"
    && Number.isFinite(value.minHostApiVersion)
    && typeof value.assetUrl === "string"
    && /^https:\/\//i.test(value.assetUrl)
    && typeof value.sha256 === "string"
    && /^[a-fA-F0-9]{64}$/.test(value.sha256)
    && Array.isArray(value.permissions)
    && value.permissions.every((permission) => typeof permission === "string")
    && Array.isArray(value.platforms)
    && value.platforms.every((platform) => typeof platform === "string");
}

function canonicalize(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
