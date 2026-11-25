const token = process.env.GITHUB_TOKEN || "";
const repository = process.env.GITHUB_REPOSITORY || "";
const api = "https://api.github.com";
const workflow = "d1-backup-restore.yml";
const thresholdHours = 36;
const alertTitle = "[Automated] Encrypted backup health alert";

if (!token || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GitHub Actions token and repository context are required.");
}

async function github(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("GitHub backup monitor API request failed with HTTP " + response.status + ".");
  }
  return payload;
}

const [owner, repo] = repository.split("/");
const runs = await github("/repos/" + repository + "/actions/workflows/" + workflow + "/runs?per_page=30");
const ordered = (runs.workflow_runs || []).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
const latestRun = ordered[0] || null;
const latestSuccess = ordered.find((run) => run.conclusion === "success") || null;
const now = Date.now();
const successAgeHours = latestSuccess ? (now - Date.parse(latestSuccess.updated_at || latestSuccess.created_at)) / 3_600_000 : Number.POSITIVE_INFINITY;
const latestFailed = Boolean(latestRun && latestRun.status === "completed" && latestRun.conclusion && !["success", "cancelled", "skipped"].includes(latestRun.conclusion));
const stale = !latestSuccess || successAgeHours > thresholdHours;
const alert = latestFailed || stale;

const issues = await github("/repos/" + repository + "/issues?state=open&per_page=100");
const existing = (issues || []).find((issue) => !issue.pull_request && issue.title === alertTitle);

if (alert) {
  const body = [
    "## Backup health needs attention",
    "",
    "- Latest backup workflow run: " + (latestRun ? latestRun.html_url : "No run found"),
    "- Latest run status: " + (latestRun ? latestRun.status + " / " + (latestRun.conclusion || "not completed") : "not available"),
    "- Latest successful backup: " + (latestSuccess ? latestSuccess.html_url : "No successful run found"),
    "- Age of last successful backup: " + (Number.isFinite(successAgeHours) ? successAgeHours.toFixed(1) + " hours" : "unknown"),
    "- Alert threshold: " + thresholdHours + " hours",
    "",
    "This monitor checks the encrypted same-account D1 restore and R2 media backup workflow only. It does not claim independent/off-account disaster recovery.",
    "",
    "Do not delete legacy plaintext or encrypted recovery material as part of alert resolution. Investigate the failed run, restore drill and recovery-key custody first.",
  ].join("\n");
  if (existing) {
    await github("/repos/" + repository + "/issues/" + existing.number, "PATCH", { body });
    console.log("Updated existing encrypted-backup health issue #" + existing.number + ".");
  } else {
    const created = await github("/repos/" + repository + "/issues", "POST", { title: alertTitle, body });
    console.log("Created encrypted-backup health issue #" + created.number + ".");
  }
  process.exitCode = 1;
} else {
  if (existing) {
    await github("/repos/" + repository + "/issues/" + existing.number + "/comments", "POST", {
      body: "Backup health recovered. Latest successful encrypted backup and isolated restore: " + latestSuccess.html_url + ". This confirms same-account recovery only; independent recovery remains a separate release gate.",
    });
    await github("/repos/" + repository + "/issues/" + existing.number, "PATCH", { state: "closed" });
    console.log("Closed recovered encrypted-backup health issue #" + existing.number + ".");
  } else {
    console.log("Encrypted D1 restore and R2 media backup are within the " + thresholdHours + "-hour freshness window.");
  }
}
