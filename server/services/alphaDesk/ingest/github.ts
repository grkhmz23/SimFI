import type { GithubSignal } from "../types";

const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, token: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function ingestGithubSignals(
  repos: string[],
  since: string,
  until: string
): Promise<GithubSignal[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[AlphaDesk] GITHUB_TOKEN not set, skipping GitHub ingestion");
    return [];
  }

  const signals: GithubSignal[] = [];

  for (const repo of repos) {
    try {
      const [owner, name] = repo.split("/");
      if (!owner || !name) continue;

      const commitsUrl = `https://api.github.com/repos/${owner}/${name}/commits?since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`;
      const res = await fetchWithTimeout(commitsUrl, token, FETCH_TIMEOUT_MS);
      if (!res.ok) continue;
      const commits = (await res.json()) as any[];

      signals.push({
        repo,
        commits: commits.length,
        starsDelta: 0, // would need separate call
        newContributors: new Set(commits.map((c) => c.author?.login).filter(Boolean)).size,
        releases: 0,
      });

      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // skip failed repos
    }
  }

  return signals;
}
