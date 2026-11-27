---
title: Messages
description: Send a message to Slack, Microsoft Teams or any webhook when relwolf has created a release.
---

# Messages

relwolf can post a message when it has created new releases, e.g. to Slack or Microsoft Teams. The content is
configurable: pick which release notes are sent and, optionally, the template of the message.

```yaml [relwolf.yaml]
messages:
  - type: slack # slack, teams or webhook
    sources: [ai-release, changelog] # default: release
    packages: [api] # optional, like in ai-release-notes
    webhook-url-env: SLACK_WEBHOOK_URL # default: RELWOLF_MESSAGE_WEBHOOK_URL
    template: |
      **${releases}**

      ${notes}
```

The URL of the webhook is a secret and is therefore only read from an environment variable. By default this is
`RELWOLF_MESSAGE_WEBHOOK_URL`; entries without `webhook-url-env` share this URL. Set `webhook-url-env` to the name of
another variable to post an entry to a different webhook, e.g. to notify Slack and Teams in the same job.

## When messages are sent

- Once for every release relwolf **creates**, in the run that tags the merged release request. Releases that already exist
  are not announced again, so re-running a job never sends duplicates.
- One message per group of linked packages (see `linked-versions`), containing all of its releases. Every other package
  gets its own message. With `separate-pull-requests` every release request is handled separately anyway.
- A failure (missing or invalid URL, network error, error response) only logs a warning; the release is not affected.

## Types

| `type`    | Target                           | Payload                                                            |
| --------- | -------------------------------- | ------------------------------------------------------------------ |
| `slack`   | [Slack incoming webhook][slack]  | `{"text": …}`, Markdown converted to Slack's mrkdwn                |
| `teams`   | [Teams Workflows webhook][teams] | Adaptive Card message with one text block                          |
| `webhook` | any HTTP endpoint accepting JSON | `{"text": …, "releases": [{tag, name, version, url, prerelease}]}` |

The text is limited to 20000 characters.

[slack]: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
[teams]: https://learn.microsoft.com/en-us/connectors/teams/

## Sources

`sources` selects the release notes of the message. All listed sources are combined in this order into one message
(`${notes}`); sources without text are skipped, and a heading per tag or package is added when a source has several parts.

| Source           | Content                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `release`        | Body of the created release (release text, AI release notes and changelog notes)             |
| `changelog`      | The changelog notes of the tag                                                               |
| `ai-release`     | AI release notes of `ai-release-notes.release`                                               |
| `ai-changelog`   | AI release notes of `ai-release-notes.changelog`                                             |
| `ai-file:<file>` | AI release notes of an entry of `ai-release-notes.additional-files` (the file as configured) |

The `ai-*` sources need the matching entry in [`ai-release-notes`](/configuration/ai-release-notes). The release body
already contains the AI release notes of `ai-release`, so do not combine the two.

## Template

The template is Markdown. Placeholders: `${releases}` (names linked to the releases, comma separated), `${tags}`,
`${version}` (the tags if there are several), `${name}`, `${url}` (only for a single release) and `${notes}`.
The default is `**${releases}**` followed by a blank line and `${notes}`. The release URL is only known in GitHub Actions
and GitLab CI.

## Scope

`packages` and `exclude-packages` (component names or paths) limit an entry to some packages, like in
`ai-release-notes`. A message is only sent for releases of matching packages.
