import {describe, expect, it} from 'vitest';
import {
  messagePayload,
  toSlack,
  toTeams,
  validWebhookUrl,
  type Message,
} from '../src/notify.js';

const message = (type: 'slack' | 'teams' | 'webhook', text: string): Message =>
  ({
    config: {type, sources: ['release'], packages: [], excludePackages: []},
    text,
    releases: [
      {tag: 'v1.0.0', name: 'v1.0.0', version: '1.0.0', prerelease: false},
    ],
  }) satisfies Message;

describe('notify', () => {
  it('converts Markdown to Slack mrkdwn', () => {
    expect(
      toSlack('## Fixes\n\n* **a** <b> & [c](https://x.y/?a=1&b=2)\n- d'),
    ).toBe(
      '*Fixes*\n\n• *a* &lt;b&gt; &amp; <https://x.y/?a=1&amp;b=2|c>\n• d',
    );
  });

  it('turns headings into bold text and single into blank lines for Teams', () => {
    expect(toTeams('## Fixes\n- a\n- b')).toBe('**Fixes**\n\n- a\n\n- b');
  });

  it('builds the payload of every type', () => {
    expect(messagePayload(message('slack', '**x**'))).toEqual({text: '*x*'});
    expect(messagePayload(message('webhook', 'x'))).toMatchObject({
      text: 'x',
      releases: [{tag: 'v1.0.0'}],
    });
    expect(messagePayload(message('teams', 'x'))).toMatchObject({
      type: 'message',
      attachments: [{content: {type: 'AdaptiveCard'}}],
    });
  });

  it('truncates very long messages', () => {
    const payload = messagePayload(message('webhook', 'x'.repeat(50_000))) as {
      text: string;
    };

    expect(payload.text.length).toBeLessThan(20_010);
  });

  it('accepts only http(s) URLs', () => {
    expect(validWebhookUrl('https://a.b/c')).toBe(true);
    expect(validWebhookUrl('ftp://a.b')).toBe(false);
    expect(validWebhookUrl('nope')).toBe(false);
  });
});
