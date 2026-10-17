import {describe, expect, it} from 'vitest';
import {parseBody, renderBody, renderTitle} from '../src/body.js';

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
    expect(parseBody(body)).toEqual([]);
  });

  it('renders titles that the default git-cliff config skips', () => {
    expect(renderTitle(['v1.0.0'])).toBe('chore(release): prepare for v1.0.0');
    expect(renderTitle(['v1.0.0', 'app-v2.0.0'])).toBe(
      'chore(release): prepare for v1.0.0, app-v2.0.0',
    );
  });
});
