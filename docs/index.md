---
layout: home

hero:
  name: Vibora
  text: Harness Attention. Orchestrate Agents. Ship.
  tagline: Run parallel AI coding agents. Deploy to production. Self-hosted.
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
    details: Run multiple AI agent sessions across different tasks and worktrees. See and control all sessions in one parallel view.
  - icon: 📱
    title: Work From Anywhere
    details: Close your laptop—your agents keep working on your behalf. Pick up where you left off from your phone.
  - icon: 🤖
    title: Multi-Agent Support
    details: Choose between Claude Code and OpenCode. Configure globally, per-repository, or per-task.
  - icon: 🐳
    title: Docker Compose Deployment
    details: Deploy apps with Docker Compose. Automatic domain routing with Traefik, optional Cloudflare DNS integration, and real-time build logs.
  - icon: 🔓
    title: Open Source & Self-Hosted
    details: No vendor lock-in. Inspect the code, run it anywhere, own your data. From a $5 VPS to your home lab.
---

## What It Does

Run multiple AI coding agent sessions in parallel across isolated git worktrees. Supports **Claude Code** and **OpenCode** with per-repository and per-task agent selection. Monitor them all from one screen. Close your laptop—they keep working. Deploy to production when ready. Self-hosted and open source.

## Quick Start

```bash
npx vibora@latest up
```

Open [http://localhost:7777](http://localhost:7777) in your browser.

That's it! Vibora will check for dependencies, offer to install any that are missing, and start the server.

[Get Started →](/guide/quick-start)
