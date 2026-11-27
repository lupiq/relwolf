import {RELEASE_TARGET, type StoredSummary} from './ai-release-notes.js';
import {
  aiAppliesTo,
  resolveAiFile,
  ROOT_KEY,
  type Config,
  type MessageConfig,
  type PackageConfig,
} from './config.js';

export const DEFAULT_MESSAGE_TEMPLATE = '**${releases}**\n\n${notes}';

/** Upper bound of the message text; the limits of Slack and Teams are at 40000 and about 28 KB. */
const MAX_TEXT_LENGTH = 20_000;

/** A release that was created in this run. */
export interface CreatedRelease {
  tag: string;
  name: string;
  /** Bare version. */
  version: string;
  url?: string | undefined;
  prerelease: boolean;
  /** Body of the created release. */
  body: string;
  /** Changelog notes of the tag. */
  notes: string;
  pkg: PackageConfig;
}

export interface Message {
  config: MessageConfig;
  /** Markdown. */
  text: string;
  releases: Array<{
    tag: string;
    name: string;
    version: string;
    url?: string | undefined;
    prerelease: boolean;
  }>;
}

const packageKey = (pkg: PackageConfig): string => pkg.component ?? ROOT_KEY;

/** Linked packages share one message, every other package gets its own. */
function groupReleases(
  config: Config,
  releases: ReadonlyArray<CreatedRelease>,
): Array<Array<CreatedRelease>> {
  const groups: Array<Array<CreatedRelease>> = [];
  const byGroup = new Map<ReadonlyArray<string>, Array<CreatedRelease>>();

  for (const release of releases) {
    const linked = config.linkedGroups.find(group =>
      group.includes(release.pkg.path),
    );
    const existing = linked && byGroup.get(linked);

    if (existing) {
      existing.push(release);
      continue;
    }

    const group = [release];

    groups.push(group);

    if (linked) {
      byGroup.set(linked, group);
    }
  }

  return groups;
}

interface Part {
  label: string;
  text: string;
}

function sourceParts(
  source: string,
  config: Config,
  entry: MessageConfig,
  group: ReadonlyArray<CreatedRelease>,
  summaries: ReadonlyArray<StoredSummary>,
): Array<Part> {
  if (source === 'release' || source === 'changelog') {
    return group.map(release => ({
      label: release.tag,
      text: source === 'release' ? release.body : release.notes,
    }));
  }

  const file = source.startsWith('ai-file:')
    ? source.slice('ai-file:'.length)
    : undefined;

  return summaries.flatMap(summary => {
    const release = group.find(candidate => candidate.tag === summary.tag);
    const pkg = config.packages.find(
      candidate => packageKey(candidate) === summary.key,
    );

    if (!release || !pkg || !aiAppliesTo(entry, pkg)) {
      return [];
    }

    const matches =
      file === undefined
        ? summary.target ===
          (source === 'ai-release' ? RELEASE_TARGET : undefined)
        : summary.target === resolveAiFile(file, pkg);

    return matches ? [{label: summary.key, text: summary.text}] : [];
  });
}

function renderParts(parts: ReadonlyArray<Part>): string {
  const filled = parts.filter(part => part.text.trim() !== '');

  return filled
    .map(part =>
      filled.length > 1
        ? `## ${part.label}\n\n${part.text.trim()}`
        : part.text.trim(),
    )
    .join('\n\n');
}

function releaseLink(release: Message['releases'][number]): string {
  return release.url ? `[${release.name}](${release.url})` : release.name;
}

function fillTemplate(
  template: string,
  releases: Message['releases'],
  notes: string,
): string {
  const [only] = releases;
  const values = {
    releases: releases.map(releaseLink).join(', '),
    tags: releases.map(release => release.tag).join(', '),
    version:
      releases.length === 1 && only
        ? only.version
        : releases.map(release => release.version).join(', '),
    name: releases.map(release => release.name).join(', '),
    url: (releases.length === 1 ? only?.url : undefined) ?? '',
    notes,
  };

  return template
    .replace(
      /\$\{(releases|tags|version|name|url|notes)\}/g,
      (_, key: string) => values[key as keyof typeof values],
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The messages for the releases created in one release request: one per message entry and group of linked packages,
 * each with the configured release notes of the packages the entry applies to.
 */
export function buildMessages(
  config: Config,
  releases: ReadonlyArray<CreatedRelease>,
  summaries: ReadonlyArray<StoredSummary>,
): Array<Message> {
  const messages: Array<Message> = [];

  for (const entry of config.messages) {
    for (const group of groupReleases(
      config,
      releases.filter(release => aiAppliesTo(entry, release.pkg)),
    )) {
      const notes = entry.sources
        .map(source =>
          renderParts(sourceParts(source, config, entry, group, summaries)),
        )
        .filter(Boolean)
        .join('\n\n');
      const described = group.map(release => ({
        tag: release.tag,
        name: release.name,
        version: release.version,
        url: release.url,
        prerelease: release.prerelease,
      }));

      messages.push({
        config: entry,
        releases: described,
        text: fillTemplate(
          entry.template ?? DEFAULT_MESSAGE_TEMPLATE,
          described,
          notes,
        ),
      });
    }
  }

  return messages;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH).trimEnd()}\n\n…`
    : text;
}

/** Markdown to Slack mrkdwn: links, bold, headings and bullets. */
export function toSlack(markdown: string): string {
  return markdown
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<$2|$1>')
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, '*$1*')
    .replace(
      /\*\*(.+?)\*\*|__(.+?)__/g,
      (_, a: string | undefined, b: string | undefined) => `*${a ?? b}*`,
    )
    .replace(/^([ \t]*)[*-][ \t]+/gm, '$1• ');
}

/** Teams cards have no headings and need blank lines for line breaks. */
export function toTeams(markdown: string): string {
  return markdown
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, '**$1**')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/(?<!\n)\n(?!\n)/g, '\n\n');
}

export function messagePayload(message: Message): unknown {
  const text = truncate(message.text);

  switch (message.config.type) {
    case 'slack':
      return {text: toSlack(text)};
    case 'teams':
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [{type: 'TextBlock', text: toTeams(text), wrap: true}],
            },
          },
        ],
      };
    case 'webhook':
      return {text, releases: message.releases};
  }
}

/** Posts a message; the error never contains the URL, which is a secret. */
export async function sendMessage(
  message: Message,
  url: string,
  timeoutMs: number,
): Promise<void> {
  let reason = '';
  // The error of fetch can contain the URL, which is a secret: only its code or name is reported.
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(messagePayload(message)),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    const {name, cause} = error as Error & {cause?: {code?: string}};

    reason = cause?.code ?? name;

    return undefined;
  });

  if (!response) {
    throw new Error(`the request failed: ${reason}`);
  }

  if (!response.ok) {
    const body = (await response.text().catch(() => '')).slice(0, 200);

    throw new Error(
      `the webhook answered ${response.status}${body ? `: ${body}` : ''}`,
    );
  }
}

export function validWebhookUrl(value: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
