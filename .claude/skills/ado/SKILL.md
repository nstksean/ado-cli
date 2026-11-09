---
name: ado
description: Azure DevOps operations — sprint queries, work item CRUD, commit linking. Use when the user mentions sprint, work item, 開卡片, 卡片, Azure DevOps, or ADO.
argument-hint: [action]
allowed-tools: Bash(ado *)
---

# Azure DevOps CLI (`ado`)

You have access to the `ado` CLI tool for Azure DevOps operations. All commands output clean JSON.

## Global Options

| Flag | Description |
|------|-------------|
| `--org <org>` | Azure DevOps organization (optional if `ADO_ORG` set in .env) |
| `--project <project>` | Azure DevOps project (optional if `ADO_PROJECT` set in .env) |
| `--area <area>` | Area path (defaults to `--project`) |
| `--pat <token>` | Override PAT from `.env` |

> Defaults are read from `~/ado-cli/.env`. Flags override defaults. Use flags to operate across different orgs/projects.

## Discovery

```bash
# Verify PAT & show current user
ado whoami

# List all projects in the default org
ado projects

# List projects in a different org
ado --org OtherOrg projects
```

## Sprint

```bash
ado sprint current
ado sprint list --timeframe current|past|future
ado sprint workitems [--iteration-id ID]
```

## Work Items

### Create

```bash
# Issue (parent)
ado wi create-issue --title "TITLE" [--iteration PATH] [--area PATH] [--tags "a; b"]

# Task (child) — use --parent to link
ado wi create-task --title "TITLE" [--description "HTML"] [--iteration PATH] [--parent ID] [--tags "a; b"]

# Composite: Issue + Task + commit link in one step
ado wi create-card \
  --issue-title "TITLE" --task-title "TITLE" \
  [--task-description "HTML"] [--iteration PATH] \
  [--project-id GUID --repo-id GUID --commit SHA] \
  [--tags "a; b"]
```

Tags are semicolon-separated (`--tags "ready-for-agent; bug"`).

### Read

```bash
ado wi get ID
ado wi list [--iteration PATH] [--state STATE] [--type TYPE] [--assigned-to NAME] [--tag TAG]
# WIQL macros are passed unquoted: --assigned-to @Me --iteration @CurrentIteration
ado wi children ID
ado wi query "WIQL"
ado wi comments ID [--since ISO] [--others-after-me]   # read-only, oldest first
# → [{id, by, mail, createdDate, format, text}]; --others-after-me = others' comments after my latest
```

### Update

```bash
ado wi update ID [--title T] [--description HTML] [--state STATE] [--assigned-to NAME] [--iteration PATH] [--tags "a; b"]
# --tags appends (merged with existing tags, never clobbers)
ado wi close ID
ado wi assign ID --to NAME
```

### Comment & Delete

```bash
ado wi comment ID --text "TEXT"          # default --format markdown (or html)
ado wi comment ID --file path.md         # long text: write a file first, avoids shell quoting
ado wi comment ID --file body.html --image a.png [--image b.png] [--width 720]
ado wi comment ID --file body.html --image a.png --dry-run   # print final body + files, no network
ado wi delete ID [--destroy]
```

- `--image` (repeatable) uploads each file as an attachment and replaces `{{img:<basename>}}` in the body with `<img src="<url>" width="<w>">`. With `--image`, format defaults to `html`. Every placeholder needs a matching `--image` and vice versa, checked before any upload.
- Mentions must be `@<guid>` (markdown) or `data-vss-mention="version:2.0,<guid>"` (html). A bare `@guid` without angle brackets is refused, also in `--dry-run`.
- Run `--dry-run` first, then the same command without it.

## Repo & Commit Linking

**IMPORTANT:**
1. Before running `ado wi link-commit`, ensure the commit has been `git push`ed to the remote. Linking a local-only commit will result in ADO being unable to display the actual content.
2. `--commit` must use the **full 40-character SHA**. Short SHAs produce broken links in ADO. Use `git rev-parse <short>` to resolve the full SHA.
3. **Never put a bare `#<number>` in a commit message** (e.g. `React error #418`, `fixes #123`). ADO scans every pushed commit message for `#<digits>` / `AB#<digits>` and creates a cross-project work item link to whatever ID matches — across the entire organization, not just this repo's project. This silently attaches your commit to a stranger's work item. Use `error 418`, `error code 418`, or a full URL instead. Use `ado wi link-commit` for intentional linking.

```bash
# Get projectId/repoId (auto-parses org from URL)
ado repo info --remote-url "REMOTE_URL"

# Link commit to work item (must be pushed + full 40-char SHA!)
FULL_SHA=$(git rev-parse <short-sha>)
ado wi link-commit --task-id ID --project-id GUID --repo-id GUID --commit $FULL_SHA
```

## Pull Requests

```bash
# Get repo ID first
ado repo info --remote-url "$(git remote get-url origin)"

# Create PR (source branch defaults to current git branch)
ado pr create --repo-id GUID --title "TITLE" --target main [--description "TEXT"] [--draft] [--work-items 1234,5678]

# List active PRs
ado pr list --repo-id GUID [--status active|abandoned|completed|all] [--top 20]

# Get PR by ID
ado pr get 1388 --repo-id GUID

# Update PR title or description
ado pr update 1388 --repo-id GUID --title "NEW TITLE" --description "NEW DESC"

# Abandon PR
ado pr abandon 1388 --repo-id GUID
```

> ⚠️ PR create requires PAT with **Code (Read & write)** scope.
> If you get 401: go to https://dev.azure.com/<org>/_usersSettings/tokens → Edit token → Code → check **Read & write** → Save.

## 「開卡片並 commit」Workflow

When the user says **「開卡片並 commit」**, follow this sequence:

1. **Commit & push** the code changes
2. **Get current sprint**: `ado sprint current` → extract `path`
3. **Get repo info**: `ado repo info --remote-url "$(git remote get-url origin)"` → extract `projectId`, `repoId`
4. **Create card** (Issue + Task + commit link):
   ```bash
   ado wi create-card \
     --issue-title "改善：NON_TECHNICAL_TITLE" \
     --task-title "NON_TECHNICAL_TITLE" \
     --task-description "<p>TECHNICAL_DETAILS_HTML</p>" \
     --iteration "SPRINT_PATH" \
     --project-id GUID --repo-id GUID --commit SHA
   ```

**Title rules:**
- Use **non-technical language** (team has non-engineering members)
- Prefix with 「改善：」for improvements or 「新增：」for new features
- Put technical details only in `--task-description` (HTML format)

**Variant — 「掛到 #XXXX」**: Skip Issue creation, create Task only:
```bash
ado wi create-task --title "TITLE" --description "HTML" --iteration PATH --parent XXXX
```

## Cross-org operations

Override defaults with flags:
```bash
# Different org
ado --org OtherOrg projects
ado --org OtherOrg --project OtherProject sprint current

# Different project (same org)
ado --project OtherProject wi list --state Active
```

## Tips

- All output is JSON — parse `id`, `url`, `path` fields from responses
- Use `ado projects` to discover available projects
- `--area` defaults to `--project` value if omitted
- Sprint iteration paths follow format: `ProjectName\Sprint YYYY-MM`
