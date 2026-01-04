---
layout: home

hero:
  name: Vibora
  text: 掌控注意力，编排代理，发布产品
  tagline: 并行运行 AI 编程代理（Claude Code、OpenCode），部署到生产环境，自托管
  image:
    src: /logo.png
    alt: Vibora
  actions:
    - theme: brand
      text: 开始使用
      link: /zh/guide/quick-start
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/knowsuchagency/vibora

features:
  - icon: "🇨🇳"
    title: 中国可用 — z.ai 集成
    details: 内置 z.ai 支持，一键配置即可在中国大陆使用 Claude Code。无需翻墙，开箱即用。
  - icon: "\U0001F680"
    title: 完整开发生命周期
    details: 从隔离的工作树到生产部署。在您自己的硬件上，通过一个开源平台完成构建、测试和发布。
  - icon: "\U0001F5A5️"
    title: 并行代理编排
    details: 跨不同任务和工作树运行多个 Claude Code 会话。在一个并行视图中查看和控制所有会话。
  - icon: "\U0001F4F1"
    title: 随时随地工作
    details: 合上笔记本电脑——Claude 继续为您工作。用手机随时接续之前的进度。
  - icon: "\U0001F916"
    title: 深度 Claude 集成
    details: 通过 MCP，Claude 可以编排任务、在远程机器上执行代码、部署应用——安全且自主。
  - icon: "\U0001F433"
    title: Docker Compose 部署
    details: 使用 Docker Compose 部署应用。Traefik 自动域名路由，可选 Cloudflare DNS 集成，实时构建日志。
  - icon: "\U0001F513"
    title: 开源与自托管
    details: 无供应商锁定。检查代码，随处运行，掌控数据。从 $5 的 VPS 到您的家庭实验室。
---

## 功能概述

在隔离的 git 工作树中并行运行多个 AI 编程代理会话。支持 **Claude Code** 和 **OpenCode**，可按仓库和任务选择代理。在一个屏幕上监控所有会话。合上笔记本电脑——它们继续工作。准备就绪后部署到生产环境。自托管且开源。

## 快速开始

```bash
npx vibora@latest up
```

在浏览器中打开 [http://localhost:7777](http://localhost:7777)。

就这样！Vibora 会检查依赖项，提示安装缺失的依赖，然后启动服务器。

[开始使用 →](/zh/guide/quick-start)
