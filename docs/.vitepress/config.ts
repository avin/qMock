import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'QMock',
  description:
    'API mocks for Vite with an override dashboard and isolated scenarios for Vitest, Playwright, and Cypress.',
  base: '/qMock/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/qMock/favicon.svg' }]],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Testing', link: '/testing/overview', activeMatch: '/testing/' },
      { text: 'Reference', link: '/reference/api' },
      { text: 'npm', link: 'https://www.npmjs.com/package/@avinlab/qmock' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Handlers and routes', link: '/guide/handlers' },
          { text: 'Responses', link: '/guide/responses' },
          { text: 'Overrides', link: '/guide/overrides' },
          { text: 'The dashboard', link: '/guide/dashboard' },
          { text: 'Modifying responses', link: '/guide/modifiers' },
          { text: 'Recipes', link: '/guide/recipes' },
        ],
      },
      {
        text: 'Testing',
        items: [
          { text: 'Overview', link: '/testing/overview' },
          { text: 'Vitest', link: '/testing/vitest' },
          { text: 'Playwright', link: '/testing/playwright' },
          { text: 'Cypress', link: '/testing/cypress' },
          { text: 'Scenario options', link: '/testing/options' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Configuration', link: '/reference/configuration' },
          { text: 'API cheat sheet', link: '/reference/api' },
          { text: 'Agent skill', link: '/reference/skill' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/avin/qMock' }],
    editLink: {
      pattern: 'https://github.com/avin/qMock/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © avin',
    },
  },
});
