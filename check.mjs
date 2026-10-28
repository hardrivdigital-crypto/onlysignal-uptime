import assert from "node:assert/strict";

const BASE = "https://api.onlysignal.news";
const TARGETS = [
  { name: "API liveness", path: "/api/healthz/live", marker: "api-liveness-v1" },
  { name: "Sign-in route", path: "/api/__clerk/v1/environment" },
];
const PAUSE_MS = 20_000;

async function check(target, fetcher = fetch) {
  try {
    const response = await fetcher(`${BASE}${target.path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status !== 200) return `HTTP ${response.status}`;
    if (!response.headers.get("content-type")?.includes("application/json")) return "Not JSON";
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid JSON";
    if (target.marker && (body.diagnosticMarker !== target.marker || body.status !== "alive")) {
      return "Unexpected liveness response";
    }
    return null;
  } catch (error) {
    return error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "Timed out" : "Connection or response error";
  }
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`GitHub incident update failed: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function reconcile(target, failure) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !process.env.GITHUB_TOKEN) throw new Error("GitHub Actions identity unavailable");
  const title = `[Uptime] OnlySignal ${target.name} unavailable`;
  const issues = await github(`/repos/${repo}/issues?state=open&per_page=100`);
  const existing = issues.find((issue) => !issue.pull_request && issue.title === title);
  if (failure && !existing) {
    const body = [
      `@${repo.split("/")[0]} — two checks failed 20 seconds apart.`,
      `Public route: ${BASE}${target.path}`,
      `Last result: ${failure}. Check Production before attempting recovery.`,
      "This automated check cannot identify the cause or repair the app.",
    ].join("\n\n");
    await github(`/repos/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
    console.log(`${target.name}: incident opened (${failure})`);
  } else if (!failure && existing) {
    await github(`/repos/${repo}/issues/${existing.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
    console.log(`${target.name}: incident closed after recovery`);
  } else {
    console.log(`${target.name}: ${failure ? `still unavailable (${failure})` : "healthy"}`);
  }
}

async function run() {
  const failures = [];
  for (const target of TARGETS) {
    const first = await check(target);
    if (first) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      const second = await check(target);
      const confirmed = second ? `${first}; ${second}` : null;
      await reconcile(target, confirmed);
      if (confirmed) failures.push(target.name);
    } else {
      await reconcile(target, null);
    }
  }
  if (failures.length) {
    throw new Error(`Confirmed unavailable: ${failures.join(", ")}`);
  }
}

async function selfTest() {
  const reply = (status, body, type = "application/json") => ({
    status, headers: new Map([["content-type", type]]), json: async () => body,
  });
  assert.equal(await check(TARGETS[0], async () => reply(200, { status: "alive", diagnosticMarker: "api-liveness-v1" })), null);
  assert.equal(await check(TARGETS[0], async () => reply(200, { status: "ok" })), "Unexpected liveness response");
  assert.equal(await check(TARGETS[1], async () => reply(200, { environment: {} })), null);
  assert.equal(await check(TARGETS[1], async () => reply(200, "<html>", "text/html")), "Not JSON");
  assert.equal(await check(TARGETS[1], async () => reply(503, {})), "HTTP 503");
  assert.equal(await check(TARGETS[1], async () => { throw new Error("offline"); }), "Connection or response error");
  console.log("Inert monitor checks passed");
}

if (process.argv.includes("--self-test")) await selfTest();
else await run();
