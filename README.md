# SecAgent Plugin Marketplace

This repository contains signed plugin metadata and the latest resolved Release information. Plugin implementations and releases remain in their own repositories.

## Layout

```text
index.json
plugins/<plugin-id>.json
scripts/generate-index.mjs
scripts/validate-index.mjs
```

`index.json` is `schemaVersion: 2` and contains one reference per plugin:

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-08-27T00:00:00.000Z",
  "plugins": [
    {
      "id": "secscore-connector",
      "path": "plugins/secscore-connector.json",
      "sha256": "..."
    }
  ],
  "signature": "base64-ed25519-signature"
}
```

Each plugin file describes stable metadata and a GitHub Release asset template. The generator resolves that template in GitHub Actions and writes the selected version, fixed asset URL, and SHA-256 into the signed `index.json`. SecAgent clients consume those signed values and do not call the GitHub Release API. The generator can calculate the SHA-256 from the asset when GitHub does not provide a digest or sidecar file.

## Signing

Generate the official Ed25519 key pair outside the repository. Put only the PKCS#8 private-key PEM in the GitHub Actions repository secret `MARKETPLACE_ED25519_PRIVATE_KEY`. The public-key PEM is embedded in SecAgent as its official trust root. Do not commit either private key or a private-key file.

The workflow in `.github/workflows/generate-index.yml` regenerates and signs `index.json` whenever a plugin metadata file changes and every 20 minutes. A plugin release does not require a commit here: publish the matching Release in that plugin's repository and the next scheduled run picks it up within 20 minutes (no-op runs leave `index.json` untouched).

For local generation:

```powershell
$env:MARKETPLACE_ED25519_PRIVATE_KEY = Get-Content -Raw .\marketplace-private-key.pem
node .\scripts\generate-index.mjs
```

For local validation:

```powershell
$env:MARKETPLACE_ED25519_PUBLIC_KEY = Get-Content -Raw .\marketplace-public-key.pem
node .\scripts\validate-index.mjs
```

Release tags may be `v<semver>` or `<semver>`. The release asset must use the name declared by the plugin metadata, for example `secscore-connector-{version}.zip` becomes `secscore-connector-2.1.6.zip`.
