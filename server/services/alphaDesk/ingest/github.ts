import type { GithubSignal } from "../types";
import { ingestFetch } from "./client";

const API_NAME = "github";

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
    const [owner, name] = repo.split("/");
    if (!owner || !name) continue;

    const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`;

    const res = await ingestFetch({
      apiName: API_NAME,
      url,
      timeoutMs: 15_000,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      retries: 1,
      retryDelayMs: 1_500,
    });

    if (!res) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    try {
      const commits = (await res.json()) as any[];
      signals.push({
        repo,
        commits: Array.isArray(commits) ? commits.length : 0,
        starsDelta: 0,
        newContributors: Array.isArray(commits)
          ? new Set(commits.map((c) => c.author?.login).filter(Boolean)).size
          : 0,
        releases: 0,
      });
    } catch {
      // skip failed repos
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return signals;
}
