# Marketplace index contract

The signed `index.json` contains each plugin metadata hash and the resolved latest
Release: SemVer, fixed asset URL, SHA-256, minimum host API version, permissions,
and supported platforms.

Release resolution runs in GitHub Actions with the workflow token. SecAgent clients
consume the signed result and do not query the GitHub Release API. They still verify
the downloaded package SHA-256 before installation.
