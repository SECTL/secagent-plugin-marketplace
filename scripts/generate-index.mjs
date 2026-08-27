import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pluginsDirectory = path.join(root, "plugins");
const indexPath = path.join(root, "index.json");
const privateKeyText = process.env.MARKETPLACE_ED25519_PRIVATE_KEY || process.env.SECAGENT_MARKET_PRIVATE_KEY;

if (!privateKeyText) {
  throw new Error("Set MARKETPLACE_ED25519_PRIVATE_KEY to the official Ed25519 private key PEM.");
}

const pluginFiles = fs.readdirSync(pluginsDirectory)
  .filter((file) => file.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));
if (!pluginFiles.length) throw new Error("No plugin metadata files found.");

const plugins = pluginFiles.map((file) => {
  const filePath = path.join(pluginsDirectory, file);
  const bytes = fs.readFileSync(filePath);
  const metadata = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (metadata.schemaVersion !== 1 || typeof metadata.id !== "string" || `${metadata.id}.json` !== file) {
    throw new Error(`Invalid plugin metadata or filename: ${file}`);
  }
  return {
    id: metadata.id,
    path: `plugins/${file}`,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
});

const unsigned = {
  schemaVersion: 2,
  generatedAt: process.env.MARKETPLACE_GENERATED_AT || new Date().toISOString(),
  plugins
};
const signature = crypto.sign(null, Buffer.from(canonicalize(unsigned), "utf8"), crypto.createPrivateKey(privateKeyText)).toString("base64");
fs.writeFileSync(indexPath, `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`, "utf8");
console.log(`Generated ${path.relative(root, indexPath)} with ${plugins.length} plugins.`);

function canonicalize(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
