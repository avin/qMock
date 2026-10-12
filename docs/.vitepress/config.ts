import { defineConfig, type DefaultTheme } from 'vitepress';

const sidebar = (p: string, t: Record<string, string>): DefaultTheme.Sidebar => [
  {
    text: t.guide,
    items: [
      { text: t.introduction, link: `${p}/guide/introduction` },
      { text: t.gettingStarted, link: `${p}/guide/getting-started` },
      { text: t.handlers, link: `${p}/guide/handlers` },
      { text: t.responses, link: `${p}/guide/responses` },
      { text: t.overrides, link: `${p}/guide/overrides` },
      { text: t.dashboard, link: `${p}/guide/dashboard` },
      { text: t.modifiers, link: `${p}/guide/modifiers` },
      { text: t.recipes, link: `${p}/guide/recipes` },
    ],
  },
  {
    text: t.testing,
    items: [
      { text: t.overview, link: `${p}/testing/overview` },
      { text: 'Vitest', link: `${p}/testing/vitest` },
      { text: 'Playwright', link: `${p}/testing/playwright` },
      { text: 'Cypress', link: `${p}/testing/cypress` },
      { text: t.options, link: `${p}/testing/options` },
    ],
  },
  {
    text: t.reference,
    items: [
      { text: t.configuration, link: `${p}/reference/configuration` },
      { text: t.api, link: `${p}/reference/api` },
      { text: t.skill, link: `${p}/reference/skill` },
      { text: t.troubleshooting, link: `${p}/reference/troubleshooting` },
    ],
  },
];

const nav = (p: string, t: Record<string, string>): DefaultTheme.NavItem[] => [
  { text: t.guide, link: `${p}/guide/introduction`, activeMatch: `${p}/guide/` },
  { text: t.testing, link: `${p}/testing/overview`, activeMatch: `${p}/testing/` },
  { text: t.reference, link: `${p}/reference/api` },
  { text: 'npm', link: 'https://www.npmjs.com/package/@avinlab/qmock' },
];

const en = {
  guide: 'Guide',
  introduction: 'Introduction',
  gettingStarted: 'Getting started',
  handlers: 'Handlers and routes',
  responses: 'Responses',
  overrides: 'Overrides',
  dashboard: 'The dashboard',
  modifiers: 'Modifying responses',
  recipes: 'Recipes',
  testing: 'Testing',
  overview: 'Overview',
  options: 'Scenario options',
  reference: 'Reference',
  configuration: 'Configuration',
  api: 'API cheat sheet',
  skill: 'Agent skill',
  troubleshooting: 'Troubleshooting',
};

const ru = {
  guide: 'Руководство',
  introduction: 'Введение',
  gettingStarted: 'Быстрый старт',
  handlers: 'Обработчики и маршруты',
  responses: 'Ответы',
  overrides: 'Оверрайды',
  dashboard: 'Дашборд',
  modifiers: 'Изменение ответов',
  recipes: 'Рецепты',
  testing: 'Тестирование',
  overview: 'Обзор',
  options: 'Опции сценария',
  reference: 'Справочник',
  configuration: 'Конфигурация',
  api: 'Шпаргалка по API',
  skill: 'Навык для агента',
  troubleshooting: 'Решение проблем',
};

export default defineConfig({
  title: 'QMock',
  base: '/qMock/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/qMock/favicon.svg' }]],
  themeConfig: {
    logo: '/favicon.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/avin/qMock' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          ru: {
            translations: {
              button: { buttonText: 'Поиск', buttonAriaLabel: 'Поиск' },
              modal: {
                displayDetails: 'Показать подробности',
                resetButtonTitle: 'Сбросить поиск',
                backButtonTitle: 'Закрыть поиск',
                noResultsText: 'Ничего не найдено',
                footer: {
                  selectText: 'выбрать',
                  selectKeyAriaLabel: 'enter',
                  navigateText: 'перейти',
                  navigateUpKeyAriaLabel: 'стрелка вверх',
                  navigateDownKeyAriaLabel: 'стрелка вниз',
                  closeText: 'закрыть',
                  closeKeyAriaLabel: 'escape',
                },
              },
            },
          },
        },
      },
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      description:
        'API mocks for Vite with an override dashboard and isolated scenarios for Vitest, Playwright, and Cypress.',
      themeConfig: {
        nav: nav('', en),
        sidebar: sidebar('', en),
        editLink: {
          pattern: 'https://github.com/avin/qMock/edit/master/docs/:path',
          text: 'Edit this page on GitHub',
        },
        footer: { message: 'Released under the MIT License.', copyright: 'Copyright © avin' },
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      link: '/ru/',
      description:
        'API-моки для Vite с дашбордом оверрайдов и изолированными сценариями для Vitest, Playwright и Cypress.',
      themeConfig: {
        nav: nav('/ru', ru),
        sidebar: sidebar('/ru', ru),
        editLink: {
          pattern: 'https://github.com/avin/qMock/edit/master/docs/:path',
          text: 'Редактировать страницу на GitHub',
        },
        footer: { message: 'Распространяется по лицензии MIT.', copyright: 'Copyright © avin' },
        outline: { label: 'На этой странице' },
        docFooter: { prev: 'Назад', next: 'Далее' },
        lastUpdated: { text: 'Обновлено' },
        langMenuLabel: 'Язык',
        returnToTopLabel: 'Наверх',
        sidebarMenuLabel: 'Меню',
        darkModeSwitchLabel: 'Тема',
        lightModeSwitchTitle: 'Светлая тема',
        darkModeSwitchTitle: 'Тёмная тема',
      },
    },
  },
});
