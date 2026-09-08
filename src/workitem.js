const { request, patchWorkItem } = require("./api");

function enc(ctx) { return encodeURIComponent(ctx.project); }

// ADO stores tags as a "; "-joined string in System.Tags
function joinTags(tags) {
  return Array.isArray(tags) ? tags.join("; ") : tags;
}

// ─── Create ──────────────────────────────────────────────

async function createIssue(ctx, { title, iterationPath, areaPath, tags }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/$Issue?api-version=7.1`;
  const doc = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/System.IterationPath", value: iterationPath || ctx.project },
    { op: "add", path: "/fields/System.AreaPath", value: areaPath || ctx.area },
  ];
  if (tags) doc.push({ op: "add", path: "/fields/System.Tags", value: joinTags(tags) });
  const r = await patchWorkItem(ctx, url, doc);
  return { id: r.id, url: r._links?.html?.href || r.url, title: r.fields["System.Title"] };
}

async function createTask(ctx, { title, description, iterationPath, areaPath, parentId, tags }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/$Task?api-version=7.1`;
  const doc = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/System.IterationPath", value: iterationPath || ctx.project },
    { op: "add", path: "/fields/System.AreaPath", value: areaPath || ctx.area },
  ];
  if (description) {
    doc.push({ op: "add", path: "/fields/System.Description", value: description });
  }
  if (tags) doc.push({ op: "add", path: "/fields/System.Tags", value: joinTags(tags) });
  if (parentId) {
    doc.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${ctx.base}/${enc(ctx)}/_apis/wit/workItems/${parentId}`,
        attributes: { comment: "Parent link" },
      },
    });
  }
  const r = await patchWorkItem(ctx, url, doc);
  return { id: r.id, url: r._links?.html?.href || r.url, title: r.fields["System.Title"] };
}

// ─── Read ────────────────────────────────────────────────

async function get(ctx, { id }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`;
  const r = await request(ctx, url);
  return {
    id: r.id,
    type: r.fields["System.WorkItemType"],
    title: r.fields["System.Title"],
    state: r.fields["System.State"],
    assignedTo: r.fields["System.AssignedTo"]?.displayName || null,
    iteration: r.fields["System.IterationPath"],
    tags: r.fields["System.Tags"] || null,
    url: r._links?.html?.href || r.url,
  };
}

async function list(ctx, { iterationPath, state, type, assignedTo, tag }) {
  const conditions = [`[System.TeamProject] = '${ctx.project}'`];
  if (iterationPath) conditions.push(`[System.IterationPath] = '${iterationPath}'`);
  if (state) conditions.push(`[System.State] = '${state}'`);
  if (type) conditions.push(`[System.WorkItemType] = '${type}'`);
  if (assignedTo) conditions.push(`[System.AssignedTo] = '${assignedTo}'`);
  if (tag) conditions.push(`[System.Tags] CONTAINS '${tag.replace(/'/g, "''")}'`);

  const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(" AND ")} ORDER BY [System.Id] DESC`;
  return await queryWiql(ctx, wiql);
}

async function queryWiql(ctx, wiql) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/wiql?api-version=7.1`;
  const data = await request(ctx, url, { method: "POST", body: { query: wiql } });

  if (!data.workItems || data.workItems.length === 0) return [];

  const ids = data.workItems.map((w) => w.id).slice(0, 200);
  const batchUrl = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.IterationPath,System.Tags&api-version=7.1`;
  const batch = await request(ctx, batchUrl);

  return batch.value.map((r) => ({
    id: r.id,
    type: r.fields["System.WorkItemType"],
    title: r.fields["System.Title"],
    state: r.fields["System.State"],
    assignedTo: r.fields["System.AssignedTo"]?.displayName || null,
    iteration: r.fields["System.IterationPath"],
    tags: r.fields["System.Tags"] || null,
  }));
}

async function children(ctx, { id }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`;
  const r = await request(ctx, url);
  const childRels = (r.relations || []).filter((rel) => rel.rel === "System.LinkTypes.Hierarchy-Forward");
  if (childRels.length === 0) return [];

  const childIds = childRels.map((rel) => rel.url.split("/").pop());
  const batchUrl = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems?ids=${childIds.join(",")}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo&api-version=7.1`;
  const batch = await request(ctx, batchUrl);

  return batch.value.map((r) => ({
    id: r.id,
    type: r.fields["System.WorkItemType"],
    title: r.fields["System.Title"],
    state: r.fields["System.State"],
    assignedTo: r.fields["System.AssignedTo"]?.displayName || null,
  }));
}

// ─── Update ──────────────────────────────────────────────

async function update(ctx, { id, title, description, state, assignedTo, iterationPath, areaPath, tags }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?api-version=7.1`;
  const doc = [];
  if (title) doc.push({ op: "replace", path: "/fields/System.Title", value: title });
  if (description) {
    const current = await request(ctx, `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?fields=System.Description&api-version=7.1`);
    const existing = current.fields["System.Description"];
    const merged = existing ? `${existing}${description}` : description;
    doc.push({ op: "replace", path: "/fields/System.Description", value: merged });
  }
  if (state) doc.push({ op: "replace", path: "/fields/System.State", value: state });
  if (assignedTo) doc.push({ op: "replace", path: "/fields/System.AssignedTo", value: assignedTo });
  if (iterationPath) doc.push({ op: "replace", path: "/fields/System.IterationPath", value: iterationPath });
  if (areaPath) doc.push({ op: "replace", path: "/fields/System.AreaPath", value: areaPath });
  if (tags) {
    // ponytail: append semantics — merge with existing tags so labels never clobber each other
    const current = await request(ctx, `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?fields=System.Tags&api-version=7.1`);
    const existing = (current.fields["System.Tags"] || "").split(";").map((t) => t.trim()).filter(Boolean);
    const incoming = joinTags(tags).split(";").map((t) => t.trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...incoming])].join("; ");
    doc.push({ op: "add", path: "/fields/System.Tags", value: merged });
  }

  if (doc.length === 0) throw new Error("No fields to update");

  const r = await patchWorkItem(ctx, url, doc);
  return {
    id: r.id,
    title: r.fields["System.Title"],
    state: r.fields["System.State"],
    assignedTo: r.fields["System.AssignedTo"]?.displayName || null,
  };
}

async function close(ctx, { id }) {
  return await update(ctx, { id, state: "Closed" });
}

async function assign(ctx, { id, assignedTo }) {
  return await update(ctx, { id, assignedTo });
}

// ─── Comment ─────────────────────────────────────────────

// format 預設 markdown：ADO 留言預設是 HTML，直接貼 markdown 會把 ** 與 - 原樣顯示出來。
async function addComment(ctx, { id, text, format = "markdown" }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workItems/${id}/comments?format=${format}&api-version=7.1-preview.4`;
  const data = await request(ctx, url, { method: "POST", body: { text } });
  return { id: data.id, workItemId: data.workItemId, format: data.format, text: data.text };
}

// ─── Delete ──────────────────────────────────────────────

async function remove(ctx, { id, destroy }) {
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${id}?destroy=${!!destroy}&api-version=7.1`;
  await request(ctx, url, { method: "DELETE" });
  return { id, deleted: true, permanent: !!destroy };
}

// ─── Link ────────────────────────────────────────────────

function resolveFullSha(commitSha) {
  if (commitSha.length >= 40) return commitSha;
  const { execSync } = require("child_process");
  const full = execSync(`git rev-parse ${commitSha}`, { encoding: "utf8" }).trim();
  if (full.length < 40) throw new Error(`Cannot resolve short SHA: ${commitSha}`);
  return full;
}

async function linkCommit(ctx, { taskId, projectId, repoId, commitSha }) {
  const fullSha = resolveFullSha(commitSha);
  const url = `${ctx.base}/${enc(ctx)}/_apis/wit/workitems/${taskId}?api-version=7.1`;
  const artifactUrl = `vstfs:///Git/Commit/${projectId}%2F${repoId}%2F${fullSha}`;
  const doc = [
    {
      op: "add",
      path: "/relations/-",
      value: {
        rel: "ArtifactLink",
        url: artifactUrl,
        attributes: { name: "Fixed in Commit" },
      },
    },
  ];
  const r = await patchWorkItem(ctx, url, doc);
  return { id: r.id, linked: true, commitSha: fullSha };
}

// ─── Composite: create-card ──────────────────────────────

async function createCard(ctx, { issueTitle, taskTitle, taskDescription, iterationPath, areaPath, commitInfo, tags }) {
  const issue = await createIssue(ctx, { title: issueTitle, iterationPath, areaPath, tags });
  const task = await createTask(ctx, {
    title: taskTitle,
    description: taskDescription,
    iterationPath,
    areaPath,
    parentId: issue.id,
    tags,
  });
  const result = { issue, task };
  if (commitInfo) {
    const link = await linkCommit(ctx, {
      taskId: task.id,
      projectId: commitInfo.projectId,
      repoId: commitInfo.repoId,
      commitSha: commitInfo.commitSha,
    });
    result.commitLinked = link.linked;
  }
  return result;
}

module.exports = {
  createIssue, createTask, get, list, queryWiql, children,
  update, close, assign, addComment, remove, linkCommit, createCard,
};
