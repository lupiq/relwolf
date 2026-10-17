import {type Config} from 'prettier';

const config: Config = {
  arrowParens: 'avoid',
  bracketSpacing: false,
  bracketSameLine: false,
  jsxSingleQuote: false,
  quoteProps: 'consistent',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
  plugins: ['prettier-plugin-organize-imports'],
};

export default config;
