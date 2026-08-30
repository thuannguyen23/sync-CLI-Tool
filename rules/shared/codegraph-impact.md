# Codegraph Impact Gate

Before changing an existing shared symbol or behavioral contract, perform impact analysis.

The required first-choice tool is `Codegraph`. Do not substitute a generic semantic-search tool when Codegraph is available.

Use Codegraph first when available for:

- public or shared functions, methods, classes, interfaces, and types;
- signatures, return types, APIs, schemas, configuration contracts, and persisted data;
- events, commands, dependency bindings, and shared state;
- cross-module or cross-package behavior;
- moving, renaming, or deleting symbols;
- changes whose callers, consumers, or blast radius are uncertain.

Inspect definitions, references, callers, callees, implementations, imports, relevant tests, and downstream consumers as applicable. Record the discovered impact before editing the contract.

A full Codegraph analysis is unnecessary only when repository evidence proves that the change is private, file-local, and has no external contract.

> **Note on Uninitialized Projects:** If you are working in a repository that does not have a `.codegraph/` directory, the Codegraph MCP server will fail. In this case, you MUST first run `codegraph init` (and follow it up with a build/index if required by the CLI) to initialize the project before using its tools.

If Codegraph is unavailable, stale, unsupported, or cannot resolve the target, use this fallback order:

1. Language-server or IDE references.
2. Repository search with `rg`.
3. Import and dependency inspection.
4. Targeted tests and build checks.

Do not silently skip impact analysis. State the fallback used and any remaining uncertainty. Codegraph findings do not authorize unrelated scope expansion.
