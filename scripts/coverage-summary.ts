// Renders the Vitest coverage summary as a Markdown table for the GitHub job summary.
// Usage: node scripts/coverage-summary.ts [coverage-summary.json]
// (writes to $GITHUB_STEP_SUMMARY, or stdout when unset)
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

interface Metric {
  total: number;
  covered: number;
  pct: number;
}

interface Entry {
  statements: Metric;
  branches: Metric;
  functions: Metric;
  lines: Metric;
}

const pct = (metric: Metric): string =>
  metric.total === 0 ? '–' : `${metric.pct.toFixed(1)} %`;

const row = (name: string, entry: Entry): string =>
  `| ${name} | ${pct(entry.lines)} | ${pct(entry.statements)} | ${pct(entry.branches)} | ${pct(entry.functions)} |`;

function render(summary: Record<string, Entry> | undefined): string {
  const lines = ['## Test coverage', ''];
  if (!summary?.total) {
    lines.push('No coverage report was produced; see the job log.');
    return lines.join('\n') + '\n';
  }

  const {total, ...files} = summary;
  lines.push(
    `**${pct(total.lines)}** of the lines are covered.`,
    '',
    '| File | Lines | Statements | Branches | Functions |',
    '| --- | --- | --- | --- | --- |',
    row('**Total**', total),
  );
  for (const [file, entry] of Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(row(path.relative(process.cwd(), file), entry));
  }
  return lines.join('\n') + '\n';
}

const file = process.argv[2] ?? 'coverage/coverage-summary.json';
const summary = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>)
  : undefined;
const markdown = render(summary);
const target = process.env.GITHUB_STEP_SUMMARY;
if (target) appendFileSync(target, markdown);
else console.log(markdown);
