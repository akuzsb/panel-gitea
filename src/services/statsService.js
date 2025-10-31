const { gitea } = require('./giteaClient');
const { asyncPool } = require('../utils/asyncPool');

const REPO_PAGE_SIZE = 50;
const COMMITS_PAGE_SIZE = 50;
const BRANCH_PAGE_SIZE = 50;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_REPO_PAGES = 200;
const MAX_BRANCH_PAGES = 200;

function toIsoString(date) {
  return date.toISOString();
}

function parseCommitDate(commit) {
  const authorDate = commit?.commit?.author?.date;
  const committerDate = commit?.commit?.committer?.date;
  const created = commit?.created;
  return new Date(authorDate || committerDate || created || 0);
}

async function fetchAllRepos() {
  const repos = [];
  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    const params = { limit: REPO_PAGE_SIZE, page };
    const { data } = await gitea.get('/repos/search', { params });
    const items = Array.isArray(data?.data) ? data.data : [];
    repos.push(...items);
    if (items.length < REPO_PAGE_SIZE) {
      keepFetching = false;
    } else {
      page += 1;
      if (page > MAX_REPO_PAGES) {
        console.warn('Se alcanzo el limite maximo de paginas de repositorios, deteniendo la busqueda anticipadamente.');
        keepFetching = false;
      }
    }
  }

  return repos;
}

async function fetchCommitsForRepo(repo, sinceDate, untilDate, branch) {
  const commits = [];
  let page = 1;
  let keepFetching = true;
  const sinceIso = sinceDate ? toIsoString(sinceDate) : undefined;
  const untilIso = untilDate ? toIsoString(untilDate) : undefined;
  const fullName = repo.full_name || `${repo.owner?.login || repo.owner?.username}/${repo.name}`;
  const [owner, repoName] = fullName.split('/');

  if (!owner || !repoName) {
    console.warn('Repositorio sin nombre completo, se omite', repo);
    return commits;
  }

  while (keepFetching) {
    const params = {
      limit: COMMITS_PAGE_SIZE,
      page,
      stat: true,
      files: false,
      verification: false
    };

    if (sinceIso) params.since = sinceIso;
    if (untilIso) params.until = untilIso;
    if (branch) params.sha = branch;

    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits`;
    const { data } = await gitea.get(url, { params });

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    commits.push(...data);

    const lastCommit = data[data.length - 1];
    const lastDate = parseCommitDate(lastCommit);
    if (sinceDate && lastDate < sinceDate) {
      keepFetching = false;
    } else if (data.length < COMMITS_PAGE_SIZE) {
      keepFetching = false;
    } else {
      page += 1;
    }
  }

  return commits;
}

function normalizeAuthor(commit) {
  const authorObj = commit?.author || commit?.committer;
  const commitAuthor = commit?.commit?.author;

  const username = authorObj?.login || authorObj?.username || commitAuthor?.email || commitAuthor?.name || 'unknown';
  const displayName = authorObj?.full_name || authorObj?.username || commitAuthor?.name || username;

  return { username, displayName };
}

function buildEmptyUserStats(username, displayName) {
  return {
    username,
    displayName,
    commits: 0,
    linesChanged: 0,
    repositories: new Set(),
    lastActivity: null
  };
}

function buildEmptyRepoStats(fullName) {
  const [owner, name] = fullName.split('/');
  return {
    owner,
    name,
    fullName,
    commits: 0,
    linesChanged: 0,
    contributors: new Set(),
    lastActivity: null,
    seenCommits: new Set()
  };
}

async function fetchRepoBranches(fullName) {
  const branches = [];
  const [owner, repoName] = fullName.split('/');
  if (!owner || !repoName) {
    return branches;
  }

  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    const params = { limit: BRANCH_PAGE_SIZE, page };
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches`;
    const { data } = await gitea.get(url, { params });

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const branch of data) {
      if (branch?.name) {
        branches.push(branch.name);
      }
    }

    if (data.length < BRANCH_PAGE_SIZE) {
      keepFetching = false;
    } else {
      page += 1;
      if (page > MAX_BRANCH_PAGES) {
        console.warn(`Se alcanzo el limite maximo de paginas de ramas para ${fullName}.`);
        keepFetching = false;
      }
    }
  }

  return branches;
}

function processCommits(repoEntry, commits, sinceDate, aggregatedUsers) {
  const fullName = repoEntry.fullName;

  for (const commit of commits) {
    const commitDate = parseCommitDate(commit);
    if (sinceDate && commitDate < sinceDate) {
      continue;
    }

    const commitSha = commit?.sha;
    if (commitSha) {
      if (repoEntry.seenCommits.has(commitSha)) {
        continue;
      }
      repoEntry.seenCommits.add(commitSha);
    }

    const { username, displayName } = normalizeAuthor(commit);
    if (!username || username === 'unknown') {
      continue;
    }

    const userEntry = aggregatedUsers.get(username) || buildEmptyUserStats(username, displayName);
    userEntry.displayName = userEntry.displayName || displayName;
    userEntry.commits += 1;

    const additions = commit?.stats?.additions ?? 0;
    const deletions = commit?.stats?.deletions ?? 0;
    const total = commit?.stats?.total ?? additions + deletions;
    userEntry.linesChanged += total;
    userEntry.repositories.add(fullName);
    if (!userEntry.lastActivity || commitDate > userEntry.lastActivity) {
      userEntry.lastActivity = commitDate;
    }
    aggregatedUsers.set(username, userEntry);

    repoEntry.commits += 1;
    repoEntry.linesChanged += total;
    repoEntry.contributors.add(username);
    if (!repoEntry.lastActivity || commitDate > repoEntry.lastActivity) {
      repoEntry.lastActivity = commitDate;
    }
  }
}

async function fetchActivityStats(days, includeAllBranches = false) {
  const now = new Date();
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const repos = await fetchAllRepos();

  const aggregatedUsers = new Map();
  const aggregatedRepos = new Map();

  await asyncPool(MAX_CONCURRENT_REQUESTS, repos, async (repo) => {
    const fullName = repo.full_name || `${repo.owner?.login || repo.owner?.username}/${repo.name}`;
    if (!fullName || !fullName.includes('/')) {
      return;
    }
    try {
      const repoEntry = aggregatedRepos.get(fullName) || buildEmptyRepoStats(fullName);

      const branches = includeAllBranches
        ? await fetchRepoBranches(fullName)
        : [repo.default_branch || ''];

      const branchesToProcess = branches.length > 0 ? branches : [''];

      for (const branchName of branchesToProcess) {
        const commits = await fetchCommitsForRepo(repo, sinceDate, now, branchName || undefined);
        if (commits.length === 0) {
          continue;
        }
        processCommits(repoEntry, commits, sinceDate, aggregatedUsers);
      }

      if (repoEntry.commits > 0) {
        aggregatedRepos.set(fullName, repoEntry);
      }
    } catch (error) {
      console.error(`No se pudo procesar el repositorio ${fullName}:`, error.message);
    }
  });

  const users = Array.from(aggregatedUsers.values())
    .map((stats) => ({
      username: stats.username,
      displayName: stats.displayName,
      commits: stats.commits,
      linesChanged: stats.linesChanged,
      repositories: stats.repositories.size,
      lastActivity: stats.lastActivity ? stats.lastActivity.toISOString() : null
    }))
    .sort((a, b) => {
      const lastActivityA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const lastActivityB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return lastActivityB - lastActivityA;
    });

  const reposStats = Array.from(aggregatedRepos.values())
    .map((stats) => ({
      owner: stats.owner,
      name: stats.name,
      fullName: stats.fullName,
      commits: stats.commits,
      linesChanged: stats.linesChanged,
      contributors: stats.contributors.size,
      lastActivity: stats.lastActivity ? stats.lastActivity.toISOString() : null
    }))
    .sort((a, b) => {
      const lastActivityA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const lastActivityB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return lastActivityB - lastActivityA;
    });

  return { users, repos: reposStats };
}

async function fetchUserStats(days, includeAllBranches = false) {
  const { users } = await fetchActivityStats(days, includeAllBranches);
  return users;
}

async function fetchRepoStats(days, includeAllBranches = false) {
  const { repos } = await fetchActivityStats(days, includeAllBranches);
  return repos;
}

module.exports = {
  fetchActivityStats,
  fetchUserStats,
  fetchRepoStats
};
