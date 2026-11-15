# Configuration safety and MCP removal plan

Goal: preserve personal settings across setup and report errors accurately; remove Slack and Telegram from the project-managed installation. AGY uses pinned v1; other agents retain v2. Secrets remain private.

- [x] Write regression tests for MCP merging, malformed Claude config, symlinks, AGY plugin backup, and doctor selection.
- [x] Implement narrowly scoped fixes and remove Slack/Telegram catalog, installation, update, version checks and documentation.
- [x] Verify tests, real isolated bootstrap and safe handling of existing local registrations; report services requiring credentials separately.

Evidence: 134/134 tests; Ubuntu 24.04 bootstrap and repeat succeeded; isolated preservation probes and AGY v1 MCP passed; local authenticated GitHub/Obsidian handshakes passed. Container health: 9 PASS, GitHub and Obsidian require local authentication/vault; MySQL database access was not tested. AGY real session passed. Slack and project-managed Telegram uninstalled locally. No credentials copied into container.
