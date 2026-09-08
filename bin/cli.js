#!/usr/bin/env node
const { program } = require("commander");
const { createContext } = require("../src/api");
const sprint = require("../src/sprint");
const workitem = require("../src/workitem");
const repo = require("../src/repo");
const org = require("../src/org");
const pipeline = require("../src/pipeline");
const pr = require("../src/pr");

const out = (data) => console.log(JSON.stringify(data, null, 2));

// Resolve context: global opts from parent command chain
function getCtx(cmd, { requireOrg = true } = {}) {
  const g = cmd.optsWithGlobals();
  return createContext({ org: g.org, project: g.project, area: g.area, pat: g.pat, requireOrg });
}

const run = (fn) => function (...args) {
  return fn.apply(this, args).catch((e) => { console.error(e.message); process.exit(1); });
};

// ─── Global options ───────────────────────────────────────
program
  .option("--org <org>", "Azure DevOps organization")
  .option("--project <project>", "Azure DevOps project name")
  .option("--area <area>", "Area path (defaults to --project)")
  .option("--pat <token>", "Personal access token (overrides ADO_PAT in .env)");

// ─── Org / Project discovery ──────────────────────────────
program
  .command("whoami")
  .description("Show authenticated user info (verify PAT works for --org)")
  .action(run(async function () { out(await org.whoami(getCtx(this))); }));

program
  .command("projects")
  .description("List all projects in an organization (requires --org)")
  .action(run(async function () { out(await org.listProjects(getCtx(this))); }));

// ─── Sprint ───────────────────────────────────────────────
const sprintCmd = program.command("sprint").description("Sprint operations");

sprintCmd
  .command("current")
  .description("Get the current sprint")
  .action(run(async function () { out(await sprint.getCurrent(getCtx(this))); }));

sprintCmd
  .command("list")
  .description("List sprints")
  .option("-t, --timeframe <frame>", "Filter: past, current, future")
  .action(run(async function (opts) { out(await sprint.list(getCtx(this), { timeFrame: opts.timeframe })); }));

sprintCmd
  .command("workitems")
  .description("List work items in a sprint (defaults to current)")
  .option("--iteration-id <id>", "Sprint iteration ID")
  .action(run(async function (opts) { out(await sprint.workitems(getCtx(this), { iterationId: opts.iterationId })); }));

// ─── Work Item ────────────────────────────────────────────
const wiCmd = program.command("workitem").alias("wi").description("Work item operations");

wiCmd
  .command("create-issue")
  .description("Create an Issue work item")
  .requiredOption("--title <title>", "Issue title")
  .option("--iteration <path>", "Iteration path")
  .option("--area <path>", "Area path override")
  .option("--tags <tags>", "Semicolon-separated tags, e.g. \"P1; bug\"")
  .action(run(async function (opts) {
    out(await workitem.createIssue(getCtx(this), {
      title: opts.title, iterationPath: opts.iteration, areaPath: opts.area, tags: opts.tags,
    }));
  }));

wiCmd
  .command("create-task")
  .description("Create a Task work item")
  .requiredOption("--title <title>", "Task title")
  .option("--description <html>", "HTML description")
  .option("--iteration <path>", "Iteration path")
  .option("--area <path>", "Area path override")
  .option("--parent <id>", "Parent work item ID")
  .option("--tags <tags>", "Semicolon-separated tags, e.g. \"P1; bug\"")
  .action(run(async function (opts) {
    out(await workitem.createTask(getCtx(this), {
      title: opts.title, description: opts.description,
      iterationPath: opts.iteration, areaPath: opts.area,
      parentId: opts.parent ? Number(opts.parent) : undefined,
      tags: opts.tags,
    }));
  }));

wiCmd
  .command("create-card")
  .description("Create Issue + Task + link commit in one step")
  .requiredOption("--issue-title <title>", "Issue title")
  .requiredOption("--task-title <title>", "Task title")
  .option("--task-description <html>", "HTML description")
  .option("--iteration <path>", "Iteration path")
  .option("--area <path>", "Area path override")
  .option("--project-id <id>", "Project GUID (for commit link)")
  .option("--repo-id <id>", "Repo GUID (for commit link)")
  .option("--commit <sha>", "Git commit SHA (for commit link)")
  .option("--tags <tags>", "Semicolon-separated tags applied to both Issue and Task")
  .action(run(async function (opts) {
    let commitInfo;
    if (opts.projectId && opts.repoId && opts.commit) {
      commitInfo = { projectId: opts.projectId, repoId: opts.repoId, commitSha: opts.commit };
    }
    out(await workitem.createCard(getCtx(this), {
      issueTitle: opts.issueTitle, taskTitle: opts.taskTitle,
      taskDescription: opts.taskDescription,
      iterationPath: opts.iteration, areaPath: opts.area, commitInfo,
      tags: opts.tags,
    }));
  }));

wiCmd
  .command("get <id>")
  .description("Get a work item by ID")
  .action(run(async function (id) { out(await workitem.get(getCtx(this), { id: Number(id) })); }));

wiCmd
  .command("list")
  .description("List work items with filters")
  .option("--iteration <path>", "Filter by iteration path")
  .option("--state <state>", "Filter by state: New, Active, Closed")
  .option("--type <type>", "Filter by type: Issue, Task")
  .option("--assigned-to <name>", "Filter by assigned person")
  .option("--tag <tag>", "Filter by tag (WIQL CONTAINS)")
  .action(run(async function (opts) {
    out(await workitem.list(getCtx(this), {
      iterationPath: opts.iteration, state: opts.state,
      type: opts.type, assignedTo: opts.assignedTo,
      tag: opts.tag,
    }));
  }));

wiCmd
  .command("query <wiql>")
  .description("Run a WIQL query")
  .action(run(async function (wiql) { out(await workitem.queryWiql(getCtx(this), wiql)); }));

wiCmd
  .command("children <id>")
  .description("List child work items of a parent")
  .action(run(async function (id) { out(await workitem.children(getCtx(this), { id: Number(id) })); }));

wiCmd
  .command("update <id>")
  .description("Update a work item")
  .option("--title <title>", "New title")
  .option("--description <html>", "New description")
  .option("--state <state>", "New state")
  .option("--assigned-to <name>", "Assign to person")
  .option("--iteration <path>", "Iteration path")
  .option("--area <path>", "Area path")
  .option("--tags <tags>", "Tags to append (semicolon-separated; merged with existing, never clobbers)")
  .action(run(async function (id, opts) {
    out(await workitem.update(getCtx(this), {
      id: Number(id), title: opts.title, description: opts.description,
      state: opts.state, assignedTo: opts.assignedTo,
      iterationPath: opts.iteration, areaPath: opts.area,
      tags: opts.tags,
    }));
  }));

wiCmd
  .command("close <id>")
  .description("Close a work item")
  .action(run(async function (id) { out(await workitem.close(getCtx(this), { id: Number(id) })); }));

wiCmd
  .command("assign <id>")
  .description("Assign a work item to someone")
  .requiredOption("--to <name>", "Person to assign to")
  .action(run(async function (id, opts) { out(await workitem.assign(getCtx(this), { id: Number(id), assignedTo: opts.to })); }));

wiCmd
  .command("comment <id>")
  .description("Add a comment to a work item")
  .option("--text <text>", "Comment text (markdown)")
  .option("--file <path>", "Read comment text from a file (avoids shell quoting issues)")
  .option("--format <format>", "markdown | html", "markdown")
  .action(run(async function (id, opts) {
    const text = opts.file ? require("fs").readFileSync(opts.file, "utf8") : opts.text;
    if (!text) throw new Error("--text or --file is required");
    out(await workitem.addComment(getCtx(this), { id: Number(id), text, format: opts.format }));
  }));

wiCmd
  .command("delete <id>")
  .description("Delete a work item (moves to recycle bin)")
  .option("--destroy", "Permanently delete")
  .action(run(async function (id, opts) { out(await workitem.remove(getCtx(this), { id: Number(id), destroy: opts.destroy })); }));

wiCmd
  .command("link-commit")
  .description("Link a commit to a work item")
  .requiredOption("--task-id <id>", "Task work item ID")
  .requiredOption("--project-id <id>", "Project GUID")
  .requiredOption("--repo-id <id>", "Repo GUID")
  .requiredOption("--commit <sha>", "Git commit SHA")
  .action(run(async function (opts) {
    out(await workitem.linkCommit(getCtx(this), {
      taskId: Number(opts.taskId), projectId: opts.projectId,
      repoId: opts.repoId, commitSha: opts.commit,
    }));
  }));

// ─── Pull Request ─────────────────────────────────────────
const prCmd = program.command("pr").description("Pull request operations");

prCmd
  .command("create")
  .description("Create a pull request")
  .requiredOption("--title <title>", "PR title")
  .requiredOption("--repo-id <id>", "Repository GUID (from: ado repo info)")
  .option("--source <branch>", "Source branch (defaults to current git branch)")
  .option("--target <branch>", "Target branch (default: main)")
  .option("--description <text>", "PR description (markdown supported)")
  .option("--draft", "Create as draft PR")
  .option("--work-items <ids>", "Comma-separated work item IDs to link")
  .action(run(async function (opts) {
    const { execSync } = require("child_process");
    const sourceBranch = opts.source || execSync("git branch --show-current").toString().trim();
    const targetBranch = opts.target || "main";
    const workItemIds = opts.workItems ? opts.workItems.split(",").map((s) => s.trim()) : [];
    out(await pr.createPR(getCtx(this), {
      repoId: opts.repoId,
      title: opts.title,
      description: opts.description,
      sourceBranch,
      targetBranch,
      isDraft: !!opts.draft,
      workItemIds,
    }));
  }));

prCmd
  .command("list")
  .description("List pull requests")
  .requiredOption("--repo-id <id>", "Repository GUID")
  .option("--status <status>", "Filter by status: active, abandoned, completed, all (default: active)")
  .option("--top <n>", "Max results (default: 20)")
  .action(run(async function (opts) {
    out(await pr.listPRs(getCtx(this), {
      repoId: opts.repoId,
      status: opts.status || "active",
      top: opts.top ? Number(opts.top) : 20,
    }));
  }));

prCmd
  .command("get <id>")
  .description("Get a pull request by ID")
  .requiredOption("--repo-id <id>", "Repository GUID")
  .action(run(async function (id, opts) {
    out(await pr.getPR(getCtx(this), { repoId: opts.repoId, pullRequestId: Number(id) }));
  }));

prCmd
  .command("update <id>")
  .description("Update a pull request title or description")
  .requiredOption("--repo-id <id>", "Repository GUID")
  .option("--title <title>", "New title")
  .option("--description <text>", "New description")
  .action(run(async function (id, opts) {
    out(await pr.updatePR(getCtx(this), {
      repoId: opts.repoId,
      pullRequestId: Number(id),
      title: opts.title,
      description: opts.description,
    }));
  }));

prCmd
  .command("abandon <id>")
  .description("Abandon a pull request")
  .requiredOption("--repo-id <id>", "Repository GUID")
  .action(run(async function (id, opts) {
    out(await pr.abandonPR(getCtx(this), { repoId: opts.repoId, pullRequestId: Number(id) }));
  }));

// ─── Repo ─────────────────────────────────────────────────
const repoCmd = program.command("repo").description("Git repo operations");

repoCmd
  .command("info")
  .description("Get repo projectId and repoId from Azure DevOps")
  .option("--repo-project <name>", "Repo's DevOps project (defaults to --project)")
  .option("--repo-name <name>", "Repository name")
  .option("--remote-url <url>", "Auto-parse from git remote URL (extracts org, project, repo)")
  .action(run(async function (opts) {
    const g = this.optsWithGlobals();
    let org = g.org;
    let project = opts.repoProject || g.project;
    let repoName = opts.repoName;

    if (opts.remoteUrl) {
      const parsed = repo.parseRemoteUrl(opts.remoteUrl);
      org = org || parsed.org;
      project = project || parsed.project;
      repoName = repoName || parsed.repoName;
    }

    if (!org || !project || !repoName) {
      console.error("Provide --remote-url, or --org + --repo-project + --repo-name");
      process.exit(1);
    }

    const ctx = createContext({ org, project, pat: g.pat });
    out(await repo.getRepoInfo(ctx, project, repoName));
  }));

// ─── Pipeline ─────────────────────────────────────────────
const pipelineCmd = program.command("pipeline").alias("pipe").description("Pipeline operations");

pipelineCmd
  .command("list")
  .description("List all pipelines in the project")
  .option("--top <n>", "Max results to return")
  .action(run(async function (opts) { out(await pipeline.list(getCtx(this), { top: opts.top })); }));

pipelineCmd
  .command("get <id>")
  .description("Get pipeline details")
  .action(run(async function (id) { out(await pipeline.get(getCtx(this), { id })); }));

pipelineCmd
  .command("runs <id>")
  .description("List recent runs for a pipeline")
  .option("--top <n>", "Max results to return", "10")
  .action(run(async function (id, opts) { out(await pipeline.runs(getCtx(this), { id, top: opts.top })); }));

pipelineCmd
  .command("run-get <id> <runId>")
  .description("Get details of a specific pipeline run")
  .action(run(async function (id, runId) { out(await pipeline.getRun(getCtx(this), { id, runId })); }));

pipelineCmd
  .command("run <id>")
  .description("Trigger a new pipeline run")
  .option("--branch <branch>", "Branch to run (default: pipeline default branch)")
  .option("--var <key=value...>", "Variables to pass (can repeat: --var k1=v1 --var k2=v2)")
  .action(run(async function (id, opts) {
    let variables;
    if (opts.var) {
      variables = {};
      for (const kv of opts.var) {
        const idx = kv.indexOf("=");
        if (idx === -1) throw new Error(`Invalid --var format: "${kv}", expected key=value`);
        variables[kv.slice(0, idx)] = { value: kv.slice(idx + 1) };
      }
    }
    out(await pipeline.run(getCtx(this), { id, branch: opts.branch, variables }));
  }));

pipelineCmd
  .command("logs <id> <runId>")
  .description("List log entries for a pipeline run")
  .action(run(async function (id, runId) { out(await pipeline.logs(getCtx(this), { id, runId })); }));

pipelineCmd
  .command("log <id> <runId> <logId>")
  .description("Get log content for a specific log entry")
  .action(run(async function (id, runId, logId) { out(await pipeline.getLog(getCtx(this), { id, runId, logId })); }));

program.parse();
