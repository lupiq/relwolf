import {describe, expect, it} from 'vitest';
import {
  generateSummary,
  inputHash,
  prependFileEntry,
  renderFileEntry,
  resolveEndpoint,
} from '../src/ai-summary.js';
import {parseConfig} from '../src/config.js';

const settings = (yaml = 'enabled: true') =>
  parseConfig(
    `ai-summary:\n${yaml
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n')}\n`,
  ).aiSummary;

const input = {
  tag: 'v1.0.0',
  version: '1.0.0',
  notes: '### Features\n\n- A',
  commits: ['feat: a\n\nLong body'],
};

describe('ai-summary config', () => {
  it('is disabled by default', () => {
    expect(parseConfig(undefined).aiSummary).toMatchObject({
      enabled: false,
      targets: ['changelog'],
    });
  });

  it.each([
    ['targets: [file]', /requires "file"/],
    ['base-url: https://llm.example.com/v1', /"model" is required/],
  ])('rejects %s when enabled', (extra, error) => {
    expect(() => settings(`enabled: true\n${extra}`)).toThrow(error);
  });

  it('rejects the changelog target with rewrite-changelog and strategy changesets', () => {
    expect(() =>
      parseConfig('rewrite-changelog: true\nai-summary: {enabled: true}'),
    ).toThrow(/rewrite-changelog/);
    expect(() =>
      parseConfig('strategy: changesets\nai-summary: {enabled: true}'),
    ).toThrow(/changesets/);
  });
});

describe('resolveEndpoint', () => {
  const custom = settings(
    'enabled: true\nbase-url: https://llm.example.com/v1\nmodel: m',
  );

  it('uses the configured API with RELWOLF_AI_API_KEY only', () => {
    expect(resolveEndpoint(custom, {RELWOLF_AI_API_KEY: 'k'})).toEqual({
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'k',
    });
    expect(resolveEndpoint(custom, {GITHUB_TOKEN: 't'})).toMatch(
      /RELWOLF_AI_API_KEY/,
    );
  });

  it('defaults to GitHub Models with the GitHub token on GitHub', () => {
    expect(
      resolveEndpoint(settings(), {
        RELWOLF_PROVIDER: 'github',
        GITHUB_TOKEN: 't',
      }),
    ).toEqual({baseUrl: 'https://models.github.ai/inference', apiKey: 't'});
  });

  it('requires an explicit API on GitLab', () => {
    expect(
      resolveEndpoint(settings(), {
        RELWOLF_PROVIDER: 'gitlab',
        RELWOLF_AI_API_KEY: 'k',
      }),
    ).toMatch(/base-url/);
  });
});

describe('generateSummary', () => {
  const env = {RELWOLF_AI_API_KEY: 'k'};
  const custom = settings(
    'enabled: true\nbase-url: https://llm.example.com/v1\nmodel: m\nlanguage: German',
  );

  it('sends notes and commits and returns the sanitized answer', async () => {
    const calls: Array<{url: string; body: any}> = [];
    const result = await generateSummary(custom, input, env, {
      fetchImpl: async (url, init) => {
        calls.push({url, body: JSON.parse(init?.body as string)});

        return Response.json({
          choices: [{message: {content: ' Neu <!-- relwolf:x --> '}}],
        });
      },
    });

    expect(result).toEqual({ok: true, text: 'Neu &lt;!-- relwolf:x -->'});
    expect(calls[0]!.url).toBe('https://llm.example.com/v1/chat/completions');
    expect(calls[0]!.body.model).toBe('m');
    expect(calls[0]!.body.messages[0].content).toMatch(/Write in German/);
    expect(calls[0]!.body.messages[1].content).toMatch(/Long body/);
  });

  it('returns failures instead of throwing', async () => {
    const failing = await generateSummary(custom, input, env, {
      fetchImpl: async () => new Response('denied', {status: 403}),
    });
    const empty = await generateSummary(custom, input, env, {
      fetchImpl: async () => Response.json({choices: []}),
    });
    const missingKey = await generateSummary(custom, input, {});

    expect(failing).toMatchObject({ok: false});
    expect(JSON.stringify(failing)).toMatch(/403/);
    expect(empty).toMatchObject({ok: false});
    expect(missingKey).toMatchObject({ok: false});
  });

  it('changes the input hash with the commits and the model', () => {
    const same = inputHash(custom, input);

    expect(inputHash(custom, {...input})).toBe(same);
    expect(inputHash(custom, {...input, commits: ['fix: b']})).not.toBe(same);
    expect(inputHash({...custom, model: 'n'}, input)).not.toBe(same);
  });
});

describe('summary file', () => {
  const entry = (version: string) =>
    renderFileEntry(version, 'Text', new Date('2026-01-02T10:00:00Z'));

  it('creates the file and prepends entries below the title', () => {
    const first = prependFileEntry('', 'Summaries', entry('1.0.0'));
    const second = prependFileEntry(first, 'Summaries', entry('1.1.0'));

    expect(first).toBe('# Summaries\n\n## 1.0.0 - 2026-01-02\n\nText\n');
    expect(second).toBe(
      '# Summaries\n\n## 1.1.0 - 2026-01-02\n\nText\n\n## 1.0.0 - 2026-01-02\n\nText\n',
    );
  });

  it('prepends to a file without a title', () => {
    expect(prependFileEntry('Intro\n', 'Summaries', entry('1.0.0'))).toBe(
      '## 1.0.0 - 2026-01-02\n\nText\n\nIntro\n',
    );
  });
});
