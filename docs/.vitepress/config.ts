import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Vibora',
  description: "The Vibe Engineer's Cockpit - Terminal-first AI agent orchestration",

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
          { text: 'npm', link: 'https://www.npmjs.com/package/@vibora/cli' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Tasks & Worktrees', link: '/guide/tasks' },
            { text: 'App Deployment', link: '/guide/apps' },
            { text: 'Terminal Management', link: '/guide/terminals' },
            { text: 'Remote Server', link: '/guide/remote-server' },
            { text: 'Claude Plugin', link: '/guide/claude-plugin' },
            { text: 'Desktop App', link: '/guide/desktop-app' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: 'Linear', link: '/guide/linear' },
            { text: 'GitHub', link: '/guide/github' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI Commands', link: '/reference/cli' },
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'MCP Tools', link: '/reference/mcp-tools' },
            { text: 'REST API', link: '/reference/api' },
          ],
        },
      ],
      '/development/': [
        {
          text: 'Development',
          items: [
            { text: 'Setup', link: '/development/' },
            { text: 'Architecture', link: '/development/architecture' },
            { text: 'Terminal Internals', link: '/development/terminal' },
          ],
        },
      ],
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
