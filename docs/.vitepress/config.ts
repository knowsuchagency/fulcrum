import { defineConfig } from 'vitepress'

// Shared sidebar configuration
const guideSidebar = (prefix: string) => [
  {
    text: prefix === '/zh' ? '入门' : 'Getting Started',
    items: [
      { text: prefix === '/zh' ? '介绍' : 'Introduction', link: `${prefix}/guide/` },
      { text: prefix === '/zh' ? '快速开始' : 'Quick Start', link: `${prefix}/guide/quick-start` },
    ],
  },
  {
    text: prefix === '/zh' ? '功能' : 'Features',
    items: [
      { text: prefix === '/zh' ? '任务与工作树' : 'Tasks & Worktrees', link: `${prefix}/guide/tasks` },
      { text: prefix === '/zh' ? '应用部署' : 'App Deployment', link: `${prefix}/guide/apps` },
      { text: prefix === '/zh' ? '终端管理' : 'Terminal Management', link: `${prefix}/guide/terminals` },
      { text: prefix === '/zh' ? '远程服务器' : 'Remote Server', link: `${prefix}/guide/remote-server` },
      { text: prefix === '/zh' ? 'Claude 插件' : 'Claude Plugin', link: `${prefix}/guide/claude-plugin` },
      { text: prefix === '/zh' ? 'OpenCode' : 'OpenCode', link: `${prefix}/guide/opencode` },
      { text: prefix === '/zh' ? '桌面应用' : 'Desktop App', link: `${prefix}/guide/desktop-app` },
    ],
  },
  {
    text: prefix === '/zh' ? '集成' : 'Integrations',
    items: [
      { text: 'Linear', link: `${prefix}/guide/linear` },
      { text: 'GitHub', link: `${prefix}/guide/github` },
    ],
  },
]

const referenceSidebar = (prefix: string) => [
  {
    text: prefix === '/zh' ? '参考' : 'Reference',
    items: [
      { text: prefix === '/zh' ? 'CLI 命令' : 'CLI Commands', link: `${prefix}/reference/cli` },
      { text: prefix === '/zh' ? '配置' : 'Configuration', link: `${prefix}/reference/configuration` },
      { text: prefix === '/zh' ? 'MCP 工具' : 'MCP Tools', link: `${prefix}/reference/mcp-tools` },
      { text: 'REST API', link: `${prefix}/reference/api` },
    ],
  },
]

const developmentSidebar = (prefix: string) => [
  {
    text: prefix === '/zh' ? '开发' : 'Development',
    items: [
      { text: prefix === '/zh' ? '环境搭建' : 'Setup', link: `${prefix}/development/` },
      { text: prefix === '/zh' ? '架构' : 'Architecture', link: `${prefix}/development/architecture` },
      { text: prefix === '/zh' ? '终端内部原理' : 'Terminal Internals', link: `${prefix}/development/terminal` },
    ],
  },
]

export default defineConfig({
  title: 'Vibora',
  titleTemplate: ':title - Harness Attention. Ship.',
  description: "Terminal-first AI agent orchestration for vibe engineers",

  // Deploy to Cloudflare Pages at www.vibora.dev
  base: '/',

  // Clean URLs without .html extension
  cleanUrls: true,

  // Use system preference for light/dark mode
  appearance: true,

  // Ignore localhost links (they're examples, not real links)
  ignoreDeadLinks: [
    /^http:\/\/localhost/,
  ],

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#0b7a75' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Vibora',
      titleTemplate: ':title - 掌控注意力，发布产品',
      description: '终端优先的 AI 代理编排工具，为氛围工程师打造',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/' },
          { text: '参考', link: '/zh/reference/cli' },
          { text: '开发', link: '/zh/development/' },
          {
            text: '链接',
            items: [
              { text: 'GitHub', link: 'https://github.com/knowsuchagency/vibora' },
              { text: 'npm', link: 'https://www.npmjs.com/package/vibora' },
            ],
          },
        ],
        sidebar: {
          '/zh/guide/': guideSidebar('/zh'),
          '/zh/reference/': referenceSidebar('/zh'),
          '/zh/development/': developmentSidebar('/zh'),
        },
        editLink: {
          pattern: 'https://github.com/knowsuchagency/vibora/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页',
        },
        footer: {
          message: '基于 <a href="https://polyformproject.org/licenses/perimeter/1.0.0/">PolyForm Perimeter License 1.0.0</a> 发布。',
          copyright: '版权所有 © 2024-至今 KNOWSUCHAGENCY CORP',
        },
        docFooter: {
          prev: '上一页',
          next: '下一页',
        },
        outline: {
          label: '页面导航',
        },
        lastUpdated: {
          text: '最后更新于',
        },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
      },
    },
  },

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'Development', link: '/development/' },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/knowsuchagency/vibora' },
          { text: 'npm', link: 'https://www.npmjs.com/package/vibora' },
        ],
      },
    ],

    sidebar: {
      '/guide/': guideSidebar(''),
      '/reference/': referenceSidebar(''),
      '/development/': developmentSidebar(''),
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/knowsuchagency/vibora' },
    ],

    footer: {
      message: 'Released under the <a href="https://polyformproject.org/licenses/perimeter/1.0.0/">PolyForm Perimeter License 1.0.0</a>.',
      copyright: 'Copyright © 2024-present KNOWSUCHAGENCY CORP',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/knowsuchagency/vibora/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
