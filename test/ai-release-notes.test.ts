import {describe, expect, it} from 'vitest';
import {
  generateSummary,
  inputHash,
  prependFileEntry,
  renderFileEntry,
  renderInput,
  resolveEndpoint,
} from '../src/ai-release-notes.js';
import {aiAppliesTo, parseConfig, resolveAiFile} from '../src/config.js';

const settings = (yaml = 'language: English') =>
  parseConfig(
    `ai-release-notes:\n  changelog:\n${yaml
      .split('\n')
      .map(line => `    ${line}`)
      .join('\n')}\n`,
  ).aiReleaseNotes.changelog!;

const input = {
  tag: 'v1.0.0',
  version: '1.0.0',
  notes: '### Features\n\n- A',
  commits: ['feat: a\n\nLong body'],
};

describe('ai-release-notes config', () => {
  it('is disabled by default', () => {
    expect(parseConfig(undefined).aiReleaseNotes).toEqual({files: []});
  });

  it('enables the changelog with changelog and applies defaults', () => {
    expect(settings()).toEqual({
      packages: [],
      excludePackages: [],
      provider: 'copilot-cli',
      context: 'commits',
      audience: 'users',
      excludePaths: [],
      language: 'English',
    });
  });

  it('enables only the additional files and inherits top-level options', () => {
    const config = parseConfig(
      `ai-release-notes:
  additional-files:
    - file: ./docs/de.md
      language: German
      prompt: Custom
    - file: docs/dev.md
      audience: developers
      file-title: Dev
`,
    ).aiReleaseNotes;

    expect(config.changelog).toBeUndefined();
    expect(config.files).toMatchObject([
      {
        file: 'docs/de.md',
        language: 'German',
        prompt: 'Custom',
        audience: 'users',
      },
      {
        file: 'docs/dev.md',
        fileTitle: 'Dev',
        audience: 'developers',
        language: 'English',
      },
    ]);

    const inherited = parseConfig(
      `ai-release-notes:
  context: full-diff
  language: French
  changelog: true
  additional-files:
    - file: a.md
      language: German
`,
    ).aiReleaseNotes;

    expect(inherited.changelog).toMatchObject({language: 'French'});
    expect(inherited.files[0]).toMatchObject({
      context: 'full-diff',
      language: 'German',
    });
  });

  it('scopes outputs to packages and validates the entries', () => {
    const yaml = (entry: string) =>
      `packages:
  ".": {}
  services/api: {component: api}
ai-release-notes:
  additional-files:
    - file: \${path}/NOTES.md
      ${entry}
`;
    const [file] = parseConfig(yaml('exclude-packages: [api]')).aiReleaseNotes
      .files;

    expect(file).toMatchObject({file: '${path}/NOTES.md'});
    expect(aiAppliesTo(file!, {path: '.'})).toBe(true);
    expect(aiAppliesTo(file!, {path: 'services/api', component: 'api'})).toBe(
      false,
    );
    expect(
      aiAppliesTo(
        parseConfig(yaml('packages: [services/api]')).aiReleaseNotes.files[0]!,
        {
          path: '.',
        },
      ),
    ).toBe(false);
    expect(resolveAiFile('${path}/N.md', {path: '.'})).toBe('N.md');
    expect(resolveAiFile('${component}.md', {path: '.'})).toBe('root.md');
    expect(() => parseConfig(yaml('packages: [nope]'))).toThrow(/nope/);
  });

  it('rejects options without changelog or additional files', () => {
    expect(() => parseConfig('ai-release-notes:\n  language: German')).toThrow(
      /"changelog" or at least one entry/,
    );
    expect(() =>
      parseConfig('ai-release-notes:\n  language: German\n  changelog: false'),
    ).toThrow(/"changelog" or at least one entry/);
  });

  it('rejects duplicate files and invalid file settings', () => {
    expect(() =>
      parseConfig(
        'ai-release-notes:\n  additional-files: [{file: a.md}, {file: ./a.md}]',
      ),
    ).toThrow(/used twice/);
    expect(() =>
      parseConfig(
        'ai-release-notes:\n  additional-files: [{file: a.md, provider: openai}]',
      ),
    ).toThrow(/additional-files\[0\].*base-url/);
  });

  it('parses the context and audience', () => {
    expect(settings('context: full-diff\naudience: developers')).toMatchObject({
      context: 'full-diff',
      audience: 'developers',
    });
  });

  it('parses AI context exclusions', () => {
    expect(settings('exclude-paths: [docs/**, "**/*.lock"]')).toMatchObject({
      excludePaths: ['docs/**', '**/*.lock'],
    });
    expect(() => settings('exclude-paths: ["../secrets"]')).toThrow(
      /ai-release-notes\.changelog\.exclude-paths/,
    );
  });

  it.each([
    ['provider: openai', /requires "base-url" and "model"/],
    ['provider: anthropic', /requires "model"/],
    ['base-url: https://llm.example.com/v1', /only works with the provider/],
  ])('rejects %s', (extra, error) => {
    expect(() => settings(extra)).toThrow(error);
  });

  it('rejects the AI release notes with rewrite-changelog and strategy changesets', () => {
    expect(() =>
      parseConfig(
        'rewrite-changelog: true\nai-release-notes: {changelog: true}',
      ),
    ).toThrow(/rewrite-changelog/);
    expect(() =>
      parseConfig('strategy: changesets\nai-release-notes: {changelog: true}'),
    ).toThrow(/changesets/);
  });
});

describe('resolveEndpoint', () => {
  const custom = settings(
    'provider: openai\nbase-url: https://llm.example.com/v1\nmodel: m',
  );

  it('needs RELWOLF_AI_API_KEY for the configured API', () => {
    expect(resolveEndpoint(custom, {RELWOLF_AI_API_KEY: 'k'})).toEqual({
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'k',
    });
    expect(resolveEndpoint(custom, {GITHUB_TOKEN: 't'})).toMatch(
      /RELWOLF_AI_API_KEY/,
    );
  });
});

describe('generateSummary with anthropic', () => {
  const claude = settings('provider: anthropic\nmodel: claude-x');

  it('uses the Anthropic URL unless overridden and still needs the key', () => {
    expect(resolveEndpoint(claude, {RELWOLF_AI_API_KEY: 'k'})).toEqual({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'k',
    });
    expect(resolveEndpoint(claude, {})).toMatch(/RELWOLF_AI_API_KEY/);
    expect(
      resolveEndpoint(
        settings(
          'provider: anthropic\nmodel: m\nbase-url: https://gw.example.com/v1',
        ),
        {RELWOLF_AI_API_KEY: 'k'},
      ),
    ).toMatchObject({baseUrl: 'https://gw.example.com/v1'});
  });

  it('returns failures for empty answers and rate limits', async () => {
    const env = {RELWOLF_AI_API_KEY: 'k'};
    const empty = await generateSummary(claude, input, env, {
      fetchImpl: async () => Response.json({content: [{type: 'tool_use'}]}),
    });
    const limited = await generateSummary(claude, input, env, {
      fetchImpl: async () => new Response('slow down', {status: 429}),
    });

    expect(empty).toMatchObject({ok: false});
    expect(JSON.stringify(limited)).toMatch(/rate limit/);
  });

  it('calls the Messages API with the default URL and joins the text blocks', async () => {
    const calls: Array<{url: string; headers: any; body: any}> = [];
    const result = await generateSummary(
      settings('provider: anthropic\nmodel: claude-x'),
      input,
      {RELWOLF_AI_API_KEY: 'k'},
      {
        fetchImpl: async (url, init) => {
          calls.push({
            url,
            headers: init?.headers,
            body: JSON.parse(init?.body as string),
          });

          return Response.json({
            content: [
              {type: 'text', text: 'Neu '},
              {type: 'text', text: 'und gut'},
            ],
          });
        },
      },
    );

    expect(result).toEqual({ok: true, text: 'Neu und gut'});
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers).toMatchObject({
      'x-api-key': 'k',
      'anthropic-version': '2023-06-01',
    });
    expect(calls[0]?.body).toMatchObject({
      model: 'claude-x',
      messages: [{role: 'user'}],
    });
    expect(calls[0]?.body.system).toEqual(expect.any(String));
  });
});

describe('prompt and input limits', () => {
  it('replaces the placeholders of a custom prompt', async () => {
    const custom = settings(
      'provider: openai\nbase-url: https://llm.example.com/v1\nmodel: m\nprompt: "${tag} ${version} ${component} ${audience} ${language}"',
    );
    let system = '';

    await generateSummary(
      custom,
      {...input, component: 'core'},
      {RELWOLF_AI_API_KEY: 'k'},
      {
        fetchImpl: async (_url, init) => {
          system = JSON.parse(init?.body as string).messages[0].content;

          return Response.json({choices: [{message: {content: 'x'}}]});
        },
      },
    );

    expect(system).toBe('v1.0.0 1.0.0 core users English');
  });

  it('drops commits that do not fit into the input limit', () => {
    const big = 'x'.repeat(20_000);
    const rendered = renderInput(settings(), {
      ...input,
      commits: [big, big, 'fix: last'],
    });

    expect(rendered).not.toContain('fix: last');
    expect(rendered.length).toBeLessThanOrEqual(30_000);
  });
});

describe('generateSummary', () => {
  const env = {RELWOLF_AI_API_KEY: 'k'};
  const custom = settings(
    'provider: openai\nbase-url: https://llm.example.com/v1\nmodel: m\nlanguage: German',
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
    expect(calls[0]!.body.messages[0].content).toMatch(/bold/);
    expect(calls[0]!.body.messages[1].content).toMatch(/Long body/);
  });

  it.each([
    ['changelog', 'Generated changelog:\n### Features\n\n- A'],
    ['commits', 'Commit:\nfeat: a\n\nLong body'],
    ['full-diff', 'Code diff since the previous release:\n@@ -1 +1 @@'],
  ] as const)('uses the %s context', (context, expected) => {
    const configured = settings(`context: ${context}`);

    expect(renderInput(configured, {...input, diff: '@@ -1 +1 @@'})).toContain(
      expected,
    );
  });

  it('renders the configured audience in the default prompt', async () => {
    const calls: Array<{body: any}> = [];

    await generateSummary(
      settings(
        'provider: openai\nbase-url: https://llm.example.com/v1\nmodel: m\naudience: developers',
      ),
      input,
      env,
      {
        fetchImpl: async (_url, init) => {
          calls.push({body: JSON.parse(init?.body as string)});

          return Response.json({
            choices: [{message: {content: 'Summary'}}],
          });
        },
      },
    );

    expect(calls[0]!.body.messages[0].content).toMatch(/developers/);
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

describe('generateSummary with the Copilot CLI', () => {
  const copilot = settings('model: gpt-5');

  it('runs the CLI without tools in an empty directory and without other tokens', async () => {
    const calls: Array<{command: string; args: Array<string>; env: any}> = [];
    const result = await generateSummary(
      copilot,
      input,
      {RELWOLF_AI_API_KEY: 'k', RELWOLF_TOKEN: 'app', PATH: '/bin'},
      {
        runner: async (command, args, options) => {
          calls.push({command, args, env: options.env});

          return ' Summary <!-- x -->\n';
        },
      },
    );

    expect(result).toEqual({ok: true, text: 'Summary &lt;!-- x -->'});
    expect(calls[0]!.command).toBe('copilot');
    expect(calls[0]!.args).toEqual(
      expect.arrayContaining([
        '--silent',
        '--no-custom-instructions',
        '--model',
        'gpt-5',
      ]),
    );
    expect(calls[0]!.args).not.toContain('--allow-all-tools');
    expect(calls[0]!.args[1]).toMatch(/Long body/);
    expect(calls[0]!.env.COPILOT_GITHUB_TOKEN).toBe('k');
    expect(calls[0]!.env.RELWOLF_TOKEN).toBeUndefined();
    expect(calls[0]!.env.PATH).toBe('/bin');
  });

  it('logs the version of the CLI', async () => {
    const logs: Array<string> = [];
    const calls: Array<Array<string>> = [];

    await generateSummary(
      copilot,
      input,
      {COPILOT_GITHUB_TOKEN: 't'},
      {
        log: message => logs.push(message),
        runner: async (_command, args) => {
          calls.push(args);

          return args[0] === '--version'
            ? "GitHub Copilot CLI 1.0.112.\nRun 'copilot update' to check for updates.\n"
            : 'Summary';
        },
      },
    );

    expect(logs).toEqual(['Using GitHub Copilot CLI 1.0.112.']);
    expect(calls[0]).toEqual(['--version']);
  });

  it('reports a missing token, a missing CLI and failures', async () => {
    const failing = (error: object) => async () => {
      throw Object.assign(new Error('x'), error);
    };

    expect(await generateSummary(copilot, input, {})).toMatchObject({
      ok: false,
      error: expect.stringMatching(/COPILOT_GITHUB_TOKEN/) as string,
    });
    expect(
      await generateSummary(
        copilot,
        input,
        {COPILOT_GITHUB_TOKEN: 't'},
        {runner: failing({code: 'ENOENT'})},
      ),
    ).toMatchObject({error: expect.stringMatching(/not installed/) as string});
    expect(
      await generateSummary(
        copilot,
        input,
        {COPILOT_GITHUB_TOKEN: 't'},
        {runner: failing({stderr: 'no access'})},
      ),
    ).toMatchObject({error: expect.stringMatching(/no access/) as string});
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

  it('renders the release icon and link in the heading', () => {
    expect(
      renderFileEntry('1.0.0', 'Text', new Date('2026-01-02T10:00:00Z'), {
        emoji: '🎉',
        releaseUrl: 'https://example.test/releases/1.0.0',
      }),
    ).toBe(
      '## 🎉 [1.0.0](https://example.test/releases/1.0.0) - 2026-01-02\n\nText\n',
    );
  });

  it('prepends to a file without a title', () => {
    expect(prependFileEntry('Intro\n', 'Summaries', entry('1.0.0'))).toBe(
      '## 1.0.0 - 2026-01-02\n\nText\n\nIntro\n',
    );
  });
});
