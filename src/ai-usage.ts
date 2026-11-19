/** Marker that identifies the usage comment of a release request; its attributes are the state. */
export const USAGE_MARKER = 'relwolf:usage';

/** Tokens, AI credits (GitHub Copilot) and estimated cost of AI release notes generations. */
export interface UsageTotals {
  input: number;
  output: number;
  /** USD; undefined as long as no price is configured. */
  cost?: number | undefined;
  /** AI credits billed by GitHub Copilot; undefined if no call reported them. */
  credits?: number | undefined;
  /** Number of runs that called the model. */
  runs: number;
}

const ATTRIBUTES =
  /<!-- relwolf:usage input="(\d+)" output="(\d+)"(?: cost="(\d+(?:\.\d+)?)")?(?: credits="(\d+(?:\.\d+)?)")? runs="(\d+)" -->/;

/** The totals of an earlier run from the comment body; undefined if it is not a usage comment. */
export function parseUsage(body: string): UsageTotals | undefined {
  const match = ATTRIBUTES.exec(body);

  if (!match) {
    return undefined;
  }

  return {
    input: Number(match[1]),
    output: Number(match[2]),
    cost: match[3] === undefined ? undefined : Number(match[3]),
    credits: match[4] === undefined ? undefined : Number(match[4]),
    runs: Number(match[5]),
  };
}

export function addUsage(
  total: UsageTotals | undefined,
  last: UsageTotals,
): UsageTotals {
  const cost =
    total?.cost === undefined && last.cost === undefined
      ? undefined
      : (total?.cost ?? 0) + (last.cost ?? 0);

  const credits =
    total?.credits === undefined && last.credits === undefined
      ? undefined
      : (total?.credits ?? 0) + (last.credits ?? 0);

  return {
    input: (total?.input ?? 0) + last.input,
    output: (total?.output ?? 0) + last.output,
    cost,
    credits,
    runs: (total?.runs ?? 0) + last.runs,
  };
}

const number = (value: number): string =>
  value.toLocaleString('en-US', {maximumFractionDigits: 0});

const money = (value: number): string =>
  `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 0.01 && value > 0 ? 6 : 2,
  })}`;

const credits = (value: number): string =>
  `${value.toLocaleString('en-US', {maximumFractionDigits: 2})} credits`;

const costCell = (usage: UsageTotals): string => {
  const parts = [
    ...(usage.credits === undefined ? [] : [credits(usage.credits)]),
    ...(usage.cost === undefined ? [] : [money(usage.cost)]),
  ];

  return parts.length > 0 ? parts.join(' + ') : '–';
};

const row = (label: string, usage: UsageTotals): string =>
  `| ${label} | ${number(usage.input)} | ${number(usage.output)} | ${costCell(usage)} |`;

/** The comment: a table for the last run and, if there were several, the whole release request. */
export function renderUsage(total: UsageTotals, last: UsageTotals): string {
  const attributes = `<!-- ${USAGE_MARKER} input="${total.input}" output="${total.output}"${total.cost === undefined ? '' : ` cost="${total.cost}"`}${total.credits === undefined ? '' : ` credits="${total.credits}"`} runs="${total.runs}" -->`;
  const rows = [
    row('Last run', last),
    ...(total.runs > 1 ? [row(`All ${total.runs} runs`, total)] : []),
  ];

  return [
    attributes,
    '**AI release notes usage**',
    '',
    '| | Input tokens | Output tokens | Cost |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
    '_Tokens as reported by the AI provider; AI credits as billed by GitHub Copilot; USD is an estimate from the configured prices._',
  ].join('\n');
}
