import {GitHubProvider} from './github.js';
import {GitLabProvider} from './gitlab.js';
import type {FetchLike} from './http.js';
import type {Provider} from './types.js';

export interface ProviderContext {
  provider: Provider;
  /** Branch the CI job runs for; empty for non-branch pipelines (tags, merge requests). */
  currentBranch: string;
  defaultBranch?: string | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(
      name === 'RELWOLF_TOKEN'
        ? 'Missing required environment variable RELWOLF_TOKEN. Create an access token and provide it as a masked CI/CD variable (GitLab) or as the "token" input of the action (GitHub), see https://relwolf.lupiq.io/guide/gitlab and https://relwolf.lupiq.io/guide/github.'
        : `Missing required environment variable ${name}. It is set by the CI platform; is relwolf running inside a CI job?`,
    );
  }

  return value;
}

function detectProvider(env: NodeJS.ProcessEnv): 'gitlab' | 'github' {
  const explicit = env.RELWOLF_PROVIDER;

  if (explicit) {
    if (explicit !== 'gitlab' && explicit !== 'github') {
      throw new Error(
        `RELWOLF_PROVIDER must be "gitlab" or "github", got "${explicit}"`,
      );
    }

    return explicit;
  }

  if (env.GITLAB_CI) {
    return 'gitlab';
  }

  if (env.GITHUB_ACTIONS) {
    return 'github';
  }

  throw new Error(
    'Could not detect the CI provider; set RELWOLF_PROVIDER to "gitlab" or "github"',
  );
}

export function createProviderFromEnv(
  env: NodeJS.ProcessEnv,
  fetch?: FetchLike,
): ProviderContext {
  const token = required(env, 'RELWOLF_TOKEN');
  const fetchOption = fetch ? {fetch} : {};

  if (detectProvider(env) === 'gitlab') {
    return {
      provider: new GitLabProvider({
        apiUrl: required(env, 'CI_API_V4_URL'),
        projectId: required(env, 'CI_PROJECT_ID'),
        token,
        ...fetchOption,
      }),
      currentBranch: env.CI_COMMIT_BRANCH ?? '',
      defaultBranch: env.CI_DEFAULT_BRANCH,
    };
  }

  return {
    provider: new GitHubProvider({
      apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com',
      repository: required(env, 'GITHUB_REPOSITORY'),
      token,
      ...fetchOption,
    }),
    currentBranch:
      env.GITHUB_REF_TYPE === 'branch' ? (env.GITHUB_REF_NAME ?? '') : '',
  };
}
