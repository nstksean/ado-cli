# ado-cli

[中文版 README](README.zh-TW.md)

A lightweight CLI tool for Azure DevOps sprint and work item operations. Designed as a middleware layer so that AI agents (e.g. Claude Code) can interact with Azure DevOps **without directly handling your PAT**.

Supports **multi-org and multi-project** operations — the PAT is stored once in `.env`, while org/project are passed per command.

## Features

- **Sprint** — Query current sprint, list sprints, view sprint work items
- **Work Items** — Create, update, close, assign, delete, comment, and query
- **Composite** — `create-card` builds Issue + Task + commit link in one step
- **Commit Linking** — Associate git commits with work items
- **Repo Info** — Resolve Azure DevOps project/repo GUIDs from git remote URLs
- **Multi-org** — `--org` and `--project` flags allow cross-org/project operations
- **Clean JSON output** — All commands output JSON to stdout for easy parsing

## Quick Start

```bash
# 1. Clone & install CLI
git clone https://github.com/bensonbs/ado-cli.git
cd ado-cli
npm install
npm link

# 2. Configure .env
cp .env.example .env
# Edit .env: set ADO_PAT, ADO_ORG, ADO_PROJECT

# 3. Install Claude Code skill (optional but recommended)
./install-skill.sh

# 4. Verify
ado whoami
```

Done. You now have the `ado` CLI globally and the `/ado` and `/ado-pr` skills in Claude Code.

## Installation Details

### Step 1 — CLI Tool

```bash
git clone https://github.com/bensonbs/ado-cli.git
cd ado-cli
npm install
npm link    # makes `ado` available globally
```

### Step 2 — PAT Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```
ADO_PAT=your-personal-access-token
ADO_ORG=your-organization
ADO_PROJECT=your-project-name
```

`ADO_ORG` and `ADO_PROJECT` are optional defaults — you can always override them with `--org` / `--project` flags.

#### Getting a PAT

1. Go to `https://dev.azure.com/{your-org}/_usersSettings/tokens`
2. Create a new token with **Work Items (Read & Write)** and **Code (Read)** scopes
3. Copy the token into your `.env` file

> **Security**: The `.env` file is git-ignored and never leaves your machine.

### Step 3 — Claude Code Skill (Optional)

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), install the agent skill so Claude can use `ado` commands autonomously:

```bash
# Global install — available in all projects
./install-skill.sh
```

Or install to a specific project only:

```bash
mkdir -p your-project/.claude/skills/ado
cp .claude/skills/ado/SKILL.md your-project/.claude/skills/ado/
```

After installation:
- `/ado` is available as a slash command for sprint and work item operations
- `/ado-pr` is available as a slash command for creating Pull Requests
- Claude auto-invokes the skill when you mention sprints, work items, or ADO

## Global Options

Every command accepts these flags:

| Flag | Description |
|------|-------------|
| `--org <org>` | Azure DevOps organization (defaults to `ADO_ORG` in `.env`) |
| `--project <project>` | Azure DevOps project name (defaults to `ADO_PROJECT` in `.env`) |
| `--area <area>` | Area path (defaults to `ADO_AREA_PATH` or `--project` value) |
| `--pat <token>` | Override PAT from `.env` |

```bash
# Uses defaults from .env
ado sprint current

# Override to a different org/project
ado --org OtherOrg --project OtherProject wi list --state Active
```

## Usage

### Sprint

```bash
# Get the current sprint
adosprint current

# List all sprints (filter: past, current, future)
adosprint list
adosprint list --timeframe current

# List work items in current sprint
adosprint workitems
```

### Work Items — Create

```bash
# Create an Issue
adowi create-issue --title "Improve: login flow"

# Create a Task linked to a parent Issue
adowi create-task --title "Add export button" --parent 1234

# Create a Task with HTML description
adowi create-task \
  --title "Fix timeout issue" \
  --description "<p>Increased timeout from 30s to 60s</p>" \
  --parent 1234
```

### Work Items — Create Card (Composite)

One command to create Issue + Task + commit link:

```bash
adowi create-card \
  --issue-title "Improve: upload stability" \
  --task-title "Fix upload timeout" \
  --task-description "<p>Root cause: 30s timeout too short</p>" \
  --iteration "Project\Sprint 2026-05" \
  --project-id <guid> --repo-id <guid> --commit <sha>
```

### Work Items — Read

```bash
# Get a work item by ID
adowi get 1234

# List work items with filters
adowi list --iteration "Project\Sprint 2026-05"
adowi list --state Active --type Task
adowi list --assigned-to "John Doe"

# WIQL macros are passed through unquoted
ado wi list --assigned-to @Me --iteration @CurrentIteration

# List child items of a parent
adowi children 1234

# Run a custom WIQL query
adowi query "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"
```

### Work Items — Update

```bash
# Update fields
adowi update 1234 --title "New title" --state Active

# Quick close
adowi close 1234

# Quick assign
adowi assign 1234 --to "John Doe"
```

### Work Items — Comment & Delete

```bash
# Add a comment (markdown by default; --format html to send HTML)
adowi comment 1234 --text "Deployed to staging"

# Long comments: write a file first to avoid shell quoting
ado wi comment 1234 --file comment.md

# Attach images: each --image is uploaded and {{img:<basename>}} in the text
# becomes <img src="..." width="720">. --image defaults the format to html.
ado wi comment 1234 --file comment.html --image shot1.png --image shot2.png [--width 720]

# A bare @guid mention (no angle brackets) is refused; use @<guid> or data-vss-mention

# Preview the final body and files without any network call
ado wi comment 1234 --file comment.html --image shot1.png --dry-run

# List comments oldest first (read-only)
ado wi comments 1234 [--since 2026-11-01T00:00:00Z] [--others-after-me]

# Delete (moves to recycle bin)
adowi delete 1234

# Permanently delete
adowi delete 1234 --destroy
```

### Repo Info & Commit Linking

```bash
# Get repo info — auto-parses org/project/repo from remote URL
ado repo info --remote-url "https://dev.azure.com/MyOrg/MyProject/_git/MyRepo"

# Or specify explicitly
ado repo info --repo-project MyProject --repo-name MyRepo

# Link a commit to a task
adowi link-commit \
  --task-id 1234 \
  --project-id <guid> \
  --repo-id <guid> \
  --commit "abc123def456"
```

### Full Workflow Example

```bash
# 1. Commit and push
git add -A && git commit -m "fix: resolve timeout" && git push

# 2. Get current sprint
adosprint current
# → { "path": "Project\\Sprint 2026-05", ... }

# 3. Get repo info
ado repo info --remote-url "$(git remote get-url origin)"
# → { "projectId": "xxx", "repoId": "yyy", ... }

# 4. Create card (Issue + Task + commit link) in one step
adowi create-card \
  --issue-title "Improve: file upload stability" \
  --task-title "Fix upload timeout" \
  --task-description "<p>30s timeout too short for large files</p>" \
  --iteration "Project\Sprint 2026-05" \
  --project-id xxx --repo-id yyy --commit "$(git rev-parse HEAD)"
```

## Command Reference

| Command | Description |
|---------|-------------|
| `ado sprint current` | Get current sprint |
| `ado sprint list` | List sprints |
| `ado sprint workitems` | List work items in sprint |
| `ado wi create-issue` | Create an Issue |
| `ado wi create-task` | Create a Task |
| `ado wi create-card` | Create Issue + Task + commit link |
| `ado wi get <id>` | Get work item details |
| `ado wi list` | List/filter work items |
| `ado wi query <wiql>` | Run WIQL query |
| `ado wi children <id>` | List child work items |
| `ado wi update <id>` | Update work item fields |
| `ado wi close <id>` | Close a work item |
| `ado wi assign <id>` | Assign a work item |
| `ado wi comment <id>` | Add comment (markdown default, `--image`, `--dry-run`) |
| `ado wi comments <id>` | List comments (read-only) |
| `ado wi delete <id>` | Delete work item |
| `ado wi link-commit` | Link commit to work item |
| `ado repo info` | Get repo project/repo GUIDs |

## Claude Code Skills

### `/ado` — Work Item & Sprint Operations

The installed skill teaches Claude to:
- Discover orgs and projects (`ado projects`)
- Query sprints and work items
- Create cards (Issue + Task + commit link) in one step
- Follow complex workflows automatically

### `/ado-pr` — Pull Request Creation

Automates the full PR workflow:
- Analyzes commits between current branch and target branch
- Generates PR title and description (in Traditional Chinese)
- Asks for confirmation before pushing
- Creates the PR via ADO REST API

```
/ado-pr          # target branch defaults to main
/ado-pr develop  # target branch is develop
```

No need to edit `CLAUDE.md` — the skills handle everything.

## Changelog

### 2026-11-09

- `ado wi comments <id>`: list comments (read-only, follows `continuationToken`, `--since`, `--others-after-me`)
- `ado wi comment`: `--image` (repeatable), `--width`, `--dry-run`; bare `@guid` mentions are refused
- `ado wi list`: WIQL macros such as `@Me` and `@CurrentIteration` are no longer quoted
- `npm test` runs `node:test` unit tests

### 2026-05-13

- **Skill: Added `/ado-pr` for Azure DevOps Pull Request creation**
  - Analyzes git diff vs target branch, generates PR title and description
  - Confirms with user before pushing and creating the PR
  - Creates PR via ADO REST API (no extra dependencies)
  - `install-skill.sh` now installs both `/ado` and `/ado-pr`

### 2026-04-06

- **Skill: Added sprint card rules and HTML description templates**
  - Issue/Task hierarchy definition and title prefix conventions
  - Task sizing principle: one Task = one deliverable outcome
  - HTML description templates for Issue, Task, and Incident Record
  - Comment guidelines (at the time: HTML only; `ado wi comment` now sends markdown by default, `--format html` for HTML)

## License

MIT
