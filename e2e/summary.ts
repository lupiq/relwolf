// Turns the Vitest JSON report into a Markdown table for the GitHub job summary.
// Usage: node e2e/summary.ts [report.json]   (writes to $GITHUB_STEP_SUMMARY, or stdout when unset)
import {appendFileSync, existsSync, readFileSync} from 'node:fs';

interface Assertion {
  fullName: string;
  status: string;
  duration?: number | null;
  failureMessages: string[];
}

interface Report {
  startTime: number;
  testResults: {
    status: string;
    message: string;
    assertionResults: Assertion[];
  }[];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;
const ICON: Record<string, string> = {passed: '✅', failed: '❌'};

function clean(text: string, limit = 1500): string {
  const plain = text.replace(ANSI, '').trim();

  return plain.length > limit ? `${plain.slice(0, limit)}\n…` : plain;
}

function renderSummary(report: Report | undefined): string {
  const lines = ['## GitLab E2E results', ''];
  const assertions = report?.testResults.flatMap(r => r.assertionResults) ?? [];
  const suiteErrors =
    report?.testResults.filter(r => r.status === 'failed' && r.message) ?? [];

  if (!report) {
    lines.push('No test report was produced; see the job log.');

    return lines.join('\n') + '\n';
  }

  const failed = assertions.filter(a => a.status === 'failed').length;
  const passed = assertions.filter(a => a.status === 'passed').length;

  lines.push(
    failed > 0
      ? `**${failed} failed**, ${passed} passed`
      : suiteErrors.length > 0
        ? '**The test run failed before all scenarios could run**'
        : `**All ${passed} scenarios passed**`,
    '',
  );

  if (assertions.length > 0) {
    lines.push('| Scenario | Result | Duration |', '| --- | --- | --- |');

    for (const a of assertions) {
      const seconds =
        a.duration == null ? '–' : `${(a.duration / 1000).toFixed(1)} s`;

      lines.push(
        `| ${a.fullName.replaceAll('|', '\\|')} | ${ICON[a.status] ?? '⏭️'} ${a.status} | ${seconds} |`,
      );
    }

    lines.push('');
  }

  const details = [
    ...assertions
      .filter(a => a.failureMessages.length > 0)
      .map(a => ({title: a.fullName, message: a.failureMessages.join('\n')})),
    ...suiteErrors.map(r => ({title: 'Test suite', message: r.message})),
  ];

  for (const {title, message} of details) {
    lines.push(
      `<details><summary>${title}</summary>`,
      '',
      '```',
      clean(message),
      '```',
      '',
      '</details>',
      '',
    );
  }

  return lines.join('\n');
}

const file = process.argv[2] ?? 'e2e-report.json';
const report = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as Report)
  : undefined;
const markdown = renderSummary(report);
const target = process.env.GITHUB_STEP_SUMMARY;

if (target) {
  appendFileSync(target, markdown);
} else {
  console.log(markdown);
}
