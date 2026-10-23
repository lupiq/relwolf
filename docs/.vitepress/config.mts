import {defineConfig} from 'vitepress';

const hostname = 'https://relwolf.lupiq.io';
const siteDescription =
  'Release bot for GitLab and GitHub, driven by Conventional Commits.';

export default defineConfig({
  title: 'relwolf',
  titleTemplate: ':title | relwolf',
  description: siteDescription,
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {hostname},
  markdown: {
    // Version markers keep relwolf's own docs up to date, but must not end up in copied snippets.
    config(md) {
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]!;
        if (env.relativePath !== 'configuration/updaters.md') {
          token.content = token.content.replace(
            /[ \t]+(?:#|\/\/) x-relwolf-(?:version|minor|major)[ \t]*$/gm,
            '',
          );
        }
        return fence(tokens, idx, options, env, self);
      };
    },
  },
  head: [
    // Google needs a favicon whose size is a multiple of 48 px
    ['link', {rel: 'icon', href: '/favicon.ico', sizes: '48x48'}],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        href: '/favicon-48x48.png',
        sizes: '48x48',
      },
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        href: '/favicon-96x96.png',
        sizes: '96x96',
      },
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        href: '/favicon-192x192.png',
        sizes: '192x192',
      },
    ],
    [
      'link',
      {rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any'},
    ],
    ['link', {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'}],
    ['meta', {name: 'theme-color', content: '#3a2e5e'}],
    ['meta', {property: 'og:type', content: 'website'}],
    ['meta', {property: 'og:site_name', content: 'relwolf'}],
    ['meta', {property: 'og:image', content: `${hostname}/og-image.png`}],
    ['meta', {property: 'og:image:width', content: '1200'}],
    ['meta', {property: 'og:image:height', content: '630'}],
    ['meta', {name: 'twitter:card', content: 'summary_large_image'}],
    ['meta', {name: 'twitter:image', content: `${hostname}/og-image.png`}],
  ],
  transformPageData(pageData) {
    const path = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '');
    const url = `${hostname}/${path}`;
    const title = pageData.frontmatter.title ?? pageData.title;
    const description = pageData.frontmatter.description ?? siteDescription;
    const head: [string, Record<string, string>, string?][] = [
      ['link', {rel: 'canonical', href: url}],
      ['meta', {property: 'og:url', content: url}],
      ['meta', {property: 'og:title', content: title}],
      ['meta', {property: 'og:description', content: description}],
      ['meta', {name: 'twitter:title', content: title}],
      ['meta', {name: 'twitter:description', content: description}],
    ];
    if (pageData.relativePath === 'index.md') {
      head.push([
        'script',
        {type: 'application/ld+json'},
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': 'relwolf',
          description,
          url,
          'image': `${hostname}/og-image.png`,
          'applicationCategory': 'DeveloperApplication',
          'operatingSystem': 'Linux',
          'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
          'codeRepository': 'https://github.com/lupiq/relwolf',
          'author': {
            '@type': 'Organization',
            'name': 'lupiq',
            'url': 'https://lupiq.com',
          },
        }),
      ]);
    }
    pageData.frontmatter.head ??= [];
    (pageData.frontmatter.head as unknown[]).push(...head);
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      {text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/'},
      {
        text: 'Configuration',
        link: '/configuration/',
        activeMatch: '/configuration/',
      },
      {
        text: 'Reference',
        link: '/reference/github-vs-gitlab',
        activeMatch: '/reference/',
      },
      {text: 'About', link: '/about'},
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          {text: 'Getting started', link: '/guide/getting-started'},
          {text: 'GitLab', link: '/guide/gitlab'},
          {text: 'GitHub', link: '/guide/github'},
          {text: 'How it works', link: '/guide/how-it-works'},
          {text: 'Version rules', link: '/guide/version-rules'},
          {text: 'Controlling the next version', link: '/guide/release-as'},
          {text: 'Pre-releases', link: '/guide/pre-releases'},
          {text: 'Migrating changelogs', link: '/guide/migrating'},
        ],
      },
      {
        text: 'Configuration',
        items: [
          {text: 'relwolf.yaml', link: '/configuration/'},
          {text: 'Monorepos', link: '/configuration/monorepos'},
          {text: 'Updaters', link: '/configuration/updaters'},
          {text: 'Changelog (git-cliff)', link: '/configuration/changelog'},
        ],
      },
      {
        text: 'Reference',
        items: [
          {text: 'GitHub vs. GitLab', link: '/reference/github-vs-gitlab'},
          {
            text: 'Environment variables',
            link: '/reference/environment-variables',
          },
          {text: 'Docker image', link: '/reference/docker-image'},
          {text: 'Troubleshooting', link: '/reference/troubleshooting'},
        ],
      },
      {
        text: 'Development',
        items: [
          {text: 'Contributing', link: '/development/'},
          {text: 'Releasing relwolf', link: '/development/releasing'},
        ],
      },
      {text: 'About lupiq', link: '/about'},
    ],
    socialLinks: [{icon: 'github', link: 'https://github.com/lupiq/relwolf'}],
    editLink: {
      pattern: 'https://github.com/lupiq/relwolf/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: {provider: 'local'},
    outline: [2, 3],
  },
});
