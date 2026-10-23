import {describe, expect, it} from 'vitest';
import {cliffEnv} from '../src/changelog.js';

describe('cliffEnv', () => {
  it('passes RELWOLF_TOKEN as GITLAB_TOKEN and the API URL on GitLab', () => {
    const env = cliffEnv({
      GITLAB_CI: 'true',
      RELWOLF_TOKEN: 'rw',
      CI_API_V4_URL: 'https://gitlab.example.com/api/v4',
    });

    expect(env.GITLAB_TOKEN).toBe('rw');
    expect(env.GITLAB_API_URL).toBe('https://gitlab.example.com/api/v4');
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it('passes RELWOLF_TOKEN as GITHUB_TOKEN on GitHub', () => {
    const env = cliffEnv({GITHUB_ACTIONS: 'true', RELWOLF_TOKEN: 'rw'});

    expect(env.GITHUB_TOKEN).toBe('rw');
    expect(env.GITLAB_TOKEN).toBeUndefined();
  });

  it('keeps variables set by the user', () => {
    const gitlab = cliffEnv({
      GITLAB_CI: 'true',
      RELWOLF_TOKEN: 'rw',
      GITLAB_TOKEN: 'own',
      GITLAB_API_URL: 'https://own/api/v4',
      CI_API_V4_URL: 'https://ci/api/v4',
    });

    expect(gitlab.GITLAB_TOKEN).toBe('own');
    expect(gitlab.GITLAB_API_URL).toBe('https://own/api/v4');
    expect(
      cliffEnv({
        GITHUB_ACTIONS: 'true',
        RELWOLF_TOKEN: 'rw',
        GITHUB_TOKEN: 'own',
      }).GITHUB_TOKEN,
    ).toBe('own');
  });

  it('does nothing without RELWOLF_TOKEN', () => {
    const env = {GITLAB_CI: 'true'};

    expect(cliffEnv(env)).toBe(env);
  });
});
