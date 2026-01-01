---
layout: home

hero:
  name: Vibora
  text: The Vibe Engineer's Cockpit
  tagline: Orchestrate Claude Code. Ship to production. Own your entire workflow.
  image:
    src: /logo.png
    alt: Vibora
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/knowsuchagency/vibora

features:
  - icon: 🚀
    title: Full Development Lifecycle
    details: From isolated worktrees to production deployment. Build, test, and ship—all from one open-source platform on your own hardware.
  - icon: 🖥️
    title: Parallel Agent Orchestration
    details: Run multiple Claude Code sessions across different tasks and worktrees. See and control all sessions in one parallel view.
  - icon: 📱
    title: Work From Anywhere
    details: Close your laptop—Claude keeps working on your behalf. Pick up where you left off from your phone.
  - icon: 🤖
    title: Deep Claude Integration
    details: Via MCP, Claude can orchestrate tasks, execute code on your remote machine, and deploy apps—securely and autonomously.
  - icon: 🐳
    title: Docker Compose Deployment
    details: Deploy apps with Docker Compose. Automatic domain routing with Traefik, optional Cloudflare DNS integration, and real-time build logs.
  - icon: 🔓
    title: Open Source & Self-Hosted
    details: No vendor lock-in. Inspect the code, run it anywhere, own your data. From a $5 VPS to your home lab.
---

## What It Does

**Vibora is for developers who take Claude Code seriously.** Not as a novelty, but as their primary interface for getting things done. If you live in the terminal and want to run multiple Claude Code sessions across isolated workstreams, Vibora is your cockpit.

**The complete development lifecycle.** Develop features in isolated worktrees, then deploy them to production—all from the same open-source platform running on your own hardware. No vendor lock-in, no wondering where your data lives.

## Quick Start

```bash
npx vibora@latest up
```

Open [http://localhost:7777](http://localhost:7777) in your browser.

That's it! Vibora will check for dependencies, offer to install any that are missing, and start the server.

[Get Started →](/guide/quick-start)
