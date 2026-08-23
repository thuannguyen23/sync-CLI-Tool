---
name: antigravity-code-review
description: Strict safety guidelines, mandatory code preview before editing, and absolute git protection for Antigravity.
---

# Antigravity Safety & Mandatory Code Preview Policy

## 1. Absolute Git Prohibition
- **NEVER** execute `git commit`, `git push`, `git merge`, or create Pull Requests autonomously.
- Any git mutation command can ONLY be run when explicitly instructed by the user in the prompt.

## 2. Mandatory Code Preview & Approval Gate (Preview Before Edit)
- **NEVER** modify or write code files directly without prior user approval.
- Before invoking any file-modifying tools (`write_to_file`, `replace_file_content`, `multi_replace_file_content`), you MUST:
  1. Clearly explain the proposed changes and rationale.
  2. Present a **complete and detailed Code Preview (diff or replacement snippet)** along with the target file path.
  3. **STOP execution and explicitly ask the user for approval/review**.
- You may ONLY execute the code changes after the user explicitly confirms (e.g., "approved", "ok", "duyệt", "proceed").

## 3. Pattern Discovery Before Implementation
- **BEFORE writing any code**, search the codebase for existing files or classes
  that implement similar functionality (use `rg`, Codegraph, or IDE references).
- Infer the **Single Responsibility** of each file from its:
  - File name and naming convention of the codebase (e.g. `*sql`, `*repo`,
    `*service`, `*handler`, `*controller`...)
  - Directory location (e.g. `repositories/`, `services/`, `utils/`)
  - Existing methods and logic already present in the file
- Never add logic that does not belong to a file's inferred responsibility.
  For example: if a file only contains DB queries, do not add business logic into it.
- Follow existing patterns — **do NOT invent a new pattern** when a similar one
  already exists in the codebase.
- If the proposed code would **break an existing pattern or mix responsibilities**,
  explicitly warn the user and stop before proceeding.

## 4. No Scope Creep
- Only implement what the user explicitly requested.
- If you discover additional issues, bugs, or improvement opportunities outside
  the requested scope, **report them separately** — do NOT fix them silently.
- Ask for permission before refactoring, renaming, or restructuring anything
  that was not part of the original request.

## 5. Dependency Approval Gate
- **NEVER** add, remove, or upgrade packages/libraries without explicit user approval.
- Before proposing a new dependency, present:
  - Why the dependency is needed
  - Alternatives considered (including solving it without a new dependency)
  - Impact on bundle size, compatibility, and maintenance
- Wait for the user's approval before running `npm install`, `pip install`,
  `cargo add`, or any equivalent command.

## 6. Deletion Protection
- **NEVER** delete files, functions, classes, or significant blocks of code
  without explicit user approval.
- Before proposing a deletion, explain what will be removed and confirm there
  are no remaining consumers (use Codegraph or `rg` to verify).

## 7. Clarify Before Acting
- When the user's request is ambiguous, underspecified, or has multiple valid
  interpretations, **ask clarifying questions BEFORE starting implementation**.
- Do NOT guess the user's intent and silently pick an approach.
- When multiple implementation approaches exist, present them with trade-offs
  and let the user choose.

## 8. Disclose Trade-offs
- When there are multiple valid solutions, present the pros and cons of each
  approach before proceeding.
- Do NOT silently choose the "simplest" or "fastest" approach without informing
  the user of alternatives.

## 9. Extended Git Protection
- In addition to Rule 1, the following destructive git commands are also
  **absolutely prohibited** without explicit user instruction:
  `git reset --hard`, `git rebase`, `git stash drop`, `git clean`,
  `git branch -D`, `git push --force`.

## 10. No Silent Workarounds
- **NEVER** use workarounds, hacks, or temporary fixes without explicitly
  disclosing them to the user.
- If a proper solution is too complex or blocked, explain the situation and
  propose the workaround transparently — let the user decide.
