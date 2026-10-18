# 憨包TV（HBTV）

一个简洁的视频检索与播放网页，支持实时片库、关键词搜索、视频详情、播放源切换和分集播放。

## 本地预览

```sh
npm ci
npm run dev
```

## 发布

推送到 `main` 分支后，GitHub Actions 会构建静态文件并发布到 GitHub Pages。

前端静态文件托管在 GitHub Pages，当前由 `src/config.ts` 中的 API Publish 接口提供片库检索、详情和播放地址解析。

仓库保留了一个可独立部署的 Cloudflare Worker 版本，供后续切换使用；它不代理视频流。

## 部署 Cloudflare Worker 备用 API

首次使用前，先在 Cloudflare Wrangler 中登录：

```sh
npx wrangler login
```

发布 Worker：

```sh
npm run deploy:api
```

本地运行 Worker：

```sh
npm run dev:api
```

Worker 免费额度按 Cloudflare 当前 Workers Free 计划计算。上游视频目录和播放服务由第三方维护，可用性取决于其接口状态。
