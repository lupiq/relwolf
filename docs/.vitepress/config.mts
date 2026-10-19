import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'relwolf',
  description:
    'Release bot for GitLab and GitHub, driven by Conventional Commits.',
  lang: 'en-US',
  cleanUrls: true,
  head: [
    ['link', {rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg'}],
    ['link', {rel: 'icon', type: 'image/png', href: '/favicon.png'}],
    ['link', {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'}],
    ['meta', {name: 'theme-color', content: '#3a2e5e'}],
  ],
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
