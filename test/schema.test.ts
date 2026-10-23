import {readFileSync, writeFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {configJsonSchema} from '../src/config.js';

const SCHEMA_FILE = new URL('../docs/public/schema.json', import.meta.url);

interface Schema {
  properties: Record<string, {description?: string}>;
}

describe('configJsonSchema', () => {
  const schema = configJsonSchema() as unknown as Schema;

  it('is up to date (run `pnpm schema` to regenerate)', () => {
    const generated = `${JSON.stringify(schema, null, 2)}\n`;

    if (process.env.UPDATE_SCHEMA) {
      writeFileSync(SCHEMA_FILE, generated);
    }

    expect(readFileSync(SCHEMA_FILE, 'utf8')).toBe(generated);
  });

  it('describes every option', () => {
    for (const [key, property] of Object.entries(schema.properties)) {
      expect(property.description, key).toBeTruthy();
    }
  });
});
