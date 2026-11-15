import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("setup delegates the selected agent rules to the shared sync script", () => {
  assert.match(read("setup.sh"), /node "\$AGENTS_DIR\/scripts\/sync-rules\.mjs"/);
});

test("shared policy scopes tool and skill use without adding authority", () => {
  const policy = read("rules/AGENTS.md");
  assert.match(policy, /focused-2026-11-15/);
  assert.match(policy, /Skills provide methods, not additional authority/);
  assert.match(policy, /Do not repeat completed\s+phases/);
  assert.match(policy, /Empty graph results do not prove/);
  assert.match(policy, /Do not create or rebuild an index without authorization/);
  assert.match(policy, /at most three repair rounds/);
  assert.doesNotMatch(policy, /required first-choice tool|Workflow: <state>/);
});
test("Antigravity recovery guide is translated to English", () => {
  const guide = read("docs/antigravity-session-recovery-guide.md");
  assert.match(guide, /Antigravity IDE Chat History Recovery/i);
  assert.doesNotMatch(guide, /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
});

test("host destinations have one shared registry", () => {
  assert.match(read("scripts/sync-rules.mjs"), /selectedAgentPaths/);
  assert.match(read("scripts/sync-skills.mjs"), /selectedAgentPaths/);
  assert.match(read("scripts/doctor.mjs"), /agentPaths/);
});
