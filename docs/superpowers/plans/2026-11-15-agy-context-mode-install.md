# AGY context-mode installation implementation plan

Goal: when AGY is selected, setup installs context-mode 1.0.169 separately; Codex and OpenCode retain global v2. Preserve personal files and existing data. No upstream skill edits. Recovery after compaction is outside the legacy adapter's coverage.

- [x] Tests cover new, existing, failed and incomplete installation, selected/skipped AGY and failure propagation.
- [x] Install pinned npm package into a temporary sibling, validate it, then rename into place only if no installation exists. Setup prerequisites invokes it only for selected AGY.
- [x] Existing sync deploys the pinned plugin and MCP; README documents installation and limitations.
- [x] Isolated home: actual npm install, repeated install, AGY plugin sync and strict validation, MCP initialize/ctx_execute, and allow/deny hook probes. A full clean-OS bootstrap and authenticated AGY session in this isolated home were not run; previous sessions tested the same v1 hook on the host.
- [x] Final verification: `npm test` 128/128; shell and Node syntax checks and `git diff --check` passed.
