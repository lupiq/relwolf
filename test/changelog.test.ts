import {describe, expect, it} from 'vitest';
import {applyChangelogTitle, cliffEnv} from '../src/changelog.js';

describe('applyChangelogTitle', () => {
  const changelog = '# Changelog\n\n## 1.0.0\n- a ${component}\n';

  it('replaces ${component} everywhere', () => {
    expect(
      applyChangelogTitle('# Changelog ${component}\n\n## 1.0.0\n', 'api'),
    ).toBe('# Changelog api\n\n## 1.0.0\n');
  });

  it('replaces the leading heading with the title', () => {
    expect(
      applyChangelogTitle(changelog, 'api', 'Changelog ${component}'),
    ).toBe('# Changelog api\n\n## 1.0.0\n- a api\n');
  });

  it('keeps the changelog without a title or a leading heading', () => {
    expect(applyChangelogTitle('## 1.0.0\n', 'api', 'X')).toBe('## 1.0.0\n');
    expect(applyChangelogTitle('# Changelog\n', 'api')).toBe('# Changelog\n');
  });
});

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
