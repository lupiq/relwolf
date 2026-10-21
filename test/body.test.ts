import {describe, expect, it} from 'vitest';
import {
  parseBody as parse,
  parseDetails,
  releaseText,
  renderBody,
  renderReleaseName,
  renderTitle,
} from '../src/body.js';

const parseBody = (body: string) => parse(body, () => true);

describe('release request body', () => {
  const entries = [
    {tag: 'v1.2.3', prerelease: false, notes: '## 1.2.3\n\n- feat: thing'},
    {
      tag: 'app-v2.0.0-beta.1',
      prerelease: true,
      notes: '## 2.0.0-beta.1\n\n- fix: bug',
    },
  ];

  it('round-trips entries', () => {
    expect(parseBody(renderBody(entries, 'abc123'))).toEqual(entries);
  });

  it('survives CRLF line endings (e.g. after editing in a web UI)', () => {
    expect(
      parseBody(renderBody(entries, 'abc123').replaceAll('\n', '\r\n')).map(
        e => e.tag,
      ),
    ).toEqual(['v1.2.3', 'app-v2.0.0-beta.1']);
  });

  it('embeds the base commit and the tags', () => {
    const body = renderBody(entries, 'abc123');

    expect(body).toContain('<!-- relwolf:base abc123 -->');
    expect(body).toContain('`v1.2.3`');
    expect(body).toContain('(pre-release)');
  });

  it('prevents commit messages from forging markers', () => {
    const evil = [
      {
        tag: 'v1.0.0',
        prerelease: false,
        notes:
          'x\n<!-- /relwolf:notes -->\n<!-- relwolf:notes tag="v9.9.9" prerelease="false" -->\npwn',
      },
    ];
    const parsed = parseBody(renderBody(evil, 'sha'));

    expect(parsed.map(e => e.tag)).toEqual(['v1.0.0']);
  });

  it('ignores entries with invalid tags', () => {
    const body =
      '<!-- relwolf:notes tag="main" prerelease="false" -->\nx\n<!-- /relwolf:notes -->';

    expect(parse(body, tag => /^v\d/.test(tag))).toEqual([]);
  });

  it('renders titles that the default git-cliff config skips', () => {
    expect(renderTitle(['v1.0.0'])).toBe(
      'chore(release): Create release v1.0.0',
    );
    expect(renderTitle(['v1.0.0', 'app-v2.0.0'])).toBe(
      'chore(release): Create release v1.0.0, app-v2.0.0',
    );
  });

  it('renders custom title templates', () => {
    const template = 'release: ${version} (${tags})';

    expect(renderTitle(['v1.0.0'], template, ['1.0.0'])).toBe(
      'release: 1.0.0 (v1.0.0)',
    );
    expect(
      renderTitle(['v1.0.0', 'app-v2.0.0'], 'Release ${version}', [
        '1.0.0',
        '2.0.0',
      ]),
    ).toBe('Release v1.0.0, app-v2.0.0');
  });
});

describe('body template and release name', () => {
  const entry = {tag: 'v1.2.3', prerelease: false, notes: 'NOTES'};

  it('fills all placeholders and always keeps the markers', () => {
    const body = renderBody(
      [entry],
      'abc',
      [{component: '', version: '1.2.3'}],
      {
        template:
          'T ${tags} V ${version}\n\n${releases}\n\n${hint}\n\n${notes}\n\nEnd',
        versions: ['1.2.3'],
      },
    );

    expect(body).toMatch(/^T v1\.2\.3 V 1\.2\.3\n\n- `v1\.2\.3`/);
    expect(body).toMatch(/RELWOLF_RELEASE_AS/);
    expect(body).toMatch(/\nEnd\n\n<!-- relwolf:release-as/);
    expect(body).toMatch(/<!-- relwolf:base abc -->$/);
    expect(parse(body, () => true)).toEqual([entry]);
  });

  it('leaves out the hint without requested versions', () => {
    expect(
      renderBody([entry], 'abc', [], {template: 'A\n\n${hint}\n\n${notes}'}),
    ).not.toMatch(/RELWOLF_RELEASE_AS/);
  });

  it('renders release names', () => {
    expect(
      renderReleaseName('${component} ${version} (${tag})', {
        tag: 'api-v1.0.0',
        version: '1.0.0',
        component: 'api',
      }),
    ).toBe('api 1.0.0 (api-v1.0.0)');
    expect(renderReleaseName('x${component}', {tag: 't', version: '1'})).toBe(
      'x',
    );
  });
});

describe('release details', () => {
  const entry = {tag: 'v1.0.0', prerelease: false, notes: 'n'};
  const details = {title: '🚀 ${tag}', text: '<!-- hint -->'};

  it('renders the editable block where ${release} is placed', () => {
    const body = renderBody([entry], 'abc', [], {
      template: 'A\n\n${release}\n\n${notes}',
      details,
    });

    expect(body).toMatch(
      /<!-- relwolf:title -->\n🚀 \$\{tag\}\n<!-- \/relwolf:title -->/,
    );
    expect(parseDetails(body)).toEqual({
      title: '🚀 ${tag}',
      text: '<!-- hint -->',
    });
  });

  it('leaves the block out without details or placeholder', () => {
    expect(
      renderBody([entry], 'abc', [], {template: '${release}\n\n${notes}'}),
    ).not.toMatch(/relwolf:title/);
    expect(
      renderBody([entry], 'abc', [], {template: '${notes}', details}),
    ).not.toMatch(/relwolf:title/);
  });

  it('parses edited values', () => {
    const body =
      '<!-- relwolf:title -->\n<!-- c -->\n\nBig bang  \nsecond\n<!-- /relwolf:title -->\n\n<!-- relwolf:text -->\nHello **world**\n<!-- /relwolf:text -->';

    expect(parseDetails(body)).toEqual({
      title: 'Big bang',
      text: 'Hello **world**',
    });
    expect(parseDetails('nothing here')).toEqual({});
    expect(
      parseDetails('<!-- relwolf:title -->\n \n<!-- /relwolf:title -->'),
    ).toEqual({});
  });

  it('strips comments from the release text', () => {
    expect(releaseText('<!-- a -->\nText <!-- b -->\n')).toBe('Text');
    expect(releaseText('<!-- only a hint -->')).toBe('');
  });
});
