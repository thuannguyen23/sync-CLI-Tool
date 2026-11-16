# Huong dan ap dung Beads refactor vao sync-CLI-Tool goc

> **Ban doi chieu:** `sync-CLI-Tool.zip` (goc) -> `sync-CLI-Tool-refactored-with-diff.zip` (da refactor).
>
> **Doi tuong:** Developer muon cap nhat **source cua sync-CLI-Tool** dang co, khong ghi de toan bo project va khong tu dong thay doi host config.
>
> **Patch day du:** [`patches/2026-11-16-beads-execution.patch`](patches/2026-11-16-beads-execution.patch). Day la unified Git patch voi day du tung dong code va context, khong chi la changelog.

## 1. Tong quan thay doi

- **6 file duoc sua, 8 file moi, 0 file bi xoa** so voi `sync-CLI-Tool.zip` ban dau.
- Khong sua `setup.sh`, `package.json`, `mcp/servers.json`, `scripts/sync-skills.mjs`, `scripts/sync-rules.mjs`, `scripts/sync-mcp.mjs`, `scripts/sync-hooks.mjs`, hay cac skill co san.
- Beads chi la **execution ledger tuy chon o tung coding repository**. Spec/issue/approved plan van la nguon yeu cau chinh thuc. Khong co Gas Town, agent auto-spawn, `bd init` tu dong, hay tu dong push/merge/deploy.
- Ho tro chung 3 host hien co: Codex, Antigravity, OpenCode. Cac host su dung skill qua co che `sync-skills.mjs` da co.

### 1.1 File DA SUA (MODIFIED)

| File | Sua phan nao | Tac dung | Can luu y |
| --- | --- | --- | --- |
| `AGENTS.md` | Bo sung entry cho bridge/skill, lenh kiem tra va canh bao quyen | Agent lam viec *trong repo config* hieu pham vi refactor | Khong phai global rules phan phoi cho host |
| `README.md` | Bo sung module Beads, vi du inspect/enable/ready va lien ket tai lieu | Developer nhin thay cach dung moi | Khong khoi tao Beads khi sync |
| `rules/AGENTS.md` | Tang policy revision, bo sung `Optional durable execution tracking` | Ca 3 host dung mot quy tac opt-in/authority/fallback | Neu dang co global rule custom, review hunk truoc khi ap dung |
| `scripts/handoff.mjs` | Them tham so `--bead <id>` va validation; output them issue reference | Ban giao task khi chuyen agent/session | Khong truy van DB, khong sao chep issue description |
| `tests/handoff.test.mjs` | Them test handoff issue ID va injection | Dam bao handoff khong goi `bd` | Test fixture doc lap |
| `tests/rules-sync.test.mjs` | Cap nhat policy revision assertion | Giu test khop policy moi | Khong thay doi logic sync |

### 1.2 File MOI (ADDED)

| File | Vai tro | Cac diem can xem |
| --- | --- | --- |
| `scripts/beads-workflow.mjs` | Bridge agent-neutral giua Codex/AGY/OpenCode va `bd` | `inspect`, `ready`, `enable`, `run`; pin Git root va `BEADS_DIR`; chan mot so lenh nhay cam |
| `skills/beads-execution/SKILL.md` | Skill lifecycle va cach ket hop voi workflow cu | Chi kich hoat khi project opt-in va task can state |
| `skills/beads-execution/agents/openai.yaml` | Metadata skill | Khong can cai rieng mot MCP |
| `skills/beads-execution/references/task-contract.md` | Hop dong spec/plan/task/verification | Phan biet `ready` va `approved` |
| `skills/beads-execution/references/multi-agent.md` | Quy uoc ownership, isolated scopes, serialized writes | Beads khong tu lam orchestrator |
| `docs/integrations/beads.md` | Runbook day du | Khoi tao project, resume, version/DB safety, smoke scenarios |
| `docs/superpowers/plans/2026-11-16-beads-execution-refactor.md` | ADR/plan va test evidence | Phan biet da test va chua test |
| `tests/beads-workflow.test.mjs` | Regression tests cho bridge | Fake `bd` + Git fixtures; KHONG phai E2E voi Dolt that |

### 1.3 Hai file CHI dung cho migration trong ZIP moi

| File | Noi dung |
| --- | --- |
| `APPLY_CHANGES.md` | Tai lieu ban dang doc, huong dan diff, apply, verify, rollback |
| `patches/2026-11-16-beads-execution.patch` | Full code diff tu ZIP goc sang ZIP refactor **bao gom `APPLY_CHANGES.md`**, khong tu bao gom chinh file patch |

## 2. Cach A - Ap dung patch vao checkout HIEN CO (khuyen nghi)

**Chuan bi:** Node.js `>=24.15.0`, Git, working tree sach hoac da sao luu cac file co local edits. Tuyet doi **khong** dung `git reset --hard` de xu ly conflict. Patch duoc tao tu ZIP goc; neu checkout cua ban da co commit moi/custom edits, `git apply --check` co the fail va can rebase thu cong tung hunk.

**Tai patch rieng** tu file `sync-CLI-Tool-beads-refactor.patch` duoc dinh kem cung ZIP, hoac lay tai `sync-CLI-Tool/patches/2026-11-16-beads-execution.patch` ben trong ZIP moi. Sau do:

```bash
# 1. Mo CHECKOUT THAT cua project sync-CLI-Tool
cd /path/to/your/sync-CLI-Tool

# 2. Kiem tra va bao toan cac sua doi local
git status --short
git switch -c chore/beads-execution-refactor

# 3. Thay /absolute/path/... bang duong dan file patch da tai ve
PATCH=/absolute/path/to/sync-CLI-Tool-beads-refactor.patch

git apply --check "$PATCH"  # KIEM TRA TRUOC, khong ghi file
git apply "$PATCH"          # CHI khi --check da pass

# 4. Xem file da thay doi
git status --short
git diff --check

# 5. Chay tests; nhe nhat la focused tests
node --version
node --check scripts/beads-workflow.mjs
node --test tests/beads-workflow.test.mjs tests/handoff.test.mjs tests/rules-sync.test.mjs
npm test
```

**Neu `git apply --check` fail:** dung tai do. Khong `--reject`/`--3way` mot cach may moc, khong ghi de custom rules. Mo patch va review theo bang muc 1, sau do merge tung hunk vao checkout moi va chay lai tests.

**Vi sao khong them command setup vao patch?** `npm run sync` ghi cac cau hinh host that. Chi chay **sau** khi cac tests va diff da duoc review, tren may/moi truong ban chu dong cho phep.

```bash
# 6. Thuc hien SAU KHI ban dong y cap nhat config host
npm run sync
npm run doctor
```

> `npm run sync` co the thay doi symlink, MCP config va hooks. No **khong** goi `bd init` va **khong** bat Beads tren tat ca project. Tren host production, review changes to host configs truoc khi chay.

## 3. Cach B - Mo luon ZIP refactor nhu checkout moi

Trong `sync-CLI-Tool-refactored-with-diff.zip`, thu muc goc la `sync-CLI-Tool/`, trong do da co toan bo source refactor, `APPLY_CHANGES.md` va file patch. Giai nen vao **thu muc moi** (khong ghi de checkout hien co):

```bash
mkdir -p /tmp/sync-cli-review
unzip sync-CLI-Tool-refactored-with-diff.zip -d /tmp/sync-cli-review
cd /tmp/sync-cli-review/sync-CLI-Tool
npm test
```

So sanh voi checkout local truoc khi quyet dinh copy/migrate. Neu ban chi muon tung thay doi nho, dung **Cach A** voi patch.

## 4. Bat Beads cho MỘT coding repository (KHONG phai cho sync-CLI-Tool)

**Day la buoc hoan toan rieng sau khi da ap dung refactor**. Beads CLI khong duoc tich hop nhu mot Node dependency va khong duoc tu dong cai. `bd >=1.3.4` la minimum bridge nay chap nhan, khong khang dinh moi phien ban moi hon tuong thich 100%; can kiem tra release notes / Dolt schema migration tren repo da co DB.

```bash
# O coding repository thu nghiem, VI DU: mot demo Git repo rieng
cd /path/to/sandbox-coding-repo
bd version
bd init --skip-agents --skip-hooks  # chi khi nguoi dung duyet thao tac khoi tao

git status --short  # xem .beads/ va .gitignore, tranh commit DB/secrets

# Thu inspect / preview (khong ghi manifest)
node /path/to/your/sync-CLI-Tool/scripts/beads-workflow.mjs inspect --project . --json
node /path/to/your/sync-CLI-Tool/scripts/beads-workflow.mjs enable --project .

# Explicit opt-in: tao duy nhat .agent-workflow.json
node /path/to/your/sync-CLI-Tool/scripts/beads-workflow.mjs enable --project . --apply

# Xem task khong bi blocker, khong tu dong claim
node /path/to/your/sync-CLI-Tool/scripts/beads-workflow.mjs ready --project . --json
```

Sau khi opt-in, moi agent theo cung mot contract: spec/plan -> kiem tra DB va Git -> chon dung assigned task -> claim co quyen -> implement -> fresh tests/review -> cap nhat/close co quyen -> handoff. Co the tao handoff kem ID:

```bash
node /path/to/your/sync-CLI-Tool/scripts/handoff.mjs \
  --project . --task path/to/approved-task-notes.md --bead <issue-id>
```

**Quyen quan trong:** `--allow-write` tren bridge chi la mot gate ky thuat, KHONG tu cap quyen implement, close task, push hoac merge. Voi multi-agent, can phan dinh worktree/scope ro rang va phoi hop write vao Dolt; embedded mode mac dinh khong tu giai quyet nhieu writers dong thoi.

## 5. Rollback an toan

Neu **chua** thay doi gi sau khi apply patch, co the dao nguoc bang:

```bash
cd /path/to/your/sync-CLI-Tool
PATCH=/absolute/path/to/sync-CLI-Tool-beads-refactor.patch

git apply --reverse --check "$PATCH"
git apply --reverse "$PATCH"
git status --short
```

`git apply -R` khong undo `npm run sync` va khong xoa Beads DB/manifest o coding repo. Neu da sync host config, can dung co che restore/teardown **da duoc review va sao luu** cua project; khong tu xoa global AGENTS hay skills cua nguoi dung. Neu da sua them code sau patch, nen hoan tac co chon loc tren branch thay vi reverse patch may moc.

## 6. Kiem tra ket qua va gioi han

- `git apply --check` phai PASS tren source tu ZIP goc; `git apply` phai tao dung **6 modified + 8 added + APPLY_CHANGES.md**.
- `npm test` can chay bang Node `>=24.15.0`. Ban review truoc day chay Node 22.16.0 nen 1 test environment-only fail; khong duoc tinh la production pass.
- Bridge tests dang dung fake CLI va Git fixtures. Chua thuc hien real Beads/Dolt integration test tren project cua ban va chua sync vao may ban.
- Khong thay doi spec authority, existing plans, human approvals, hay model/provider config.

**Xem chi tiet tung dong code:** mo [`patches/2026-11-16-beads-execution.patch`](patches/2026-11-16-beads-execution.patch). **Xem ly do thiet ke/flows:** [`docs/integrations/beads.md`](docs/integrations/beads.md).
