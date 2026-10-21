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

## 网页 HLS 清单兼容

网页播放请求新增可选参数 `webPlayback: true`。候选平台脚本位于 `scripts/HBTV_VIDEO_API.web-hls.js`，保留旧请求契约；该参数启用时，登记的 HTTP 清单入口会返回 `format: "hls"` 和清单文本，前端通过 HLS.js 播放，视频分片继续 HTTPS 直连片源。

当前只允许清单入口 `122.228.193.79:3721/api/`，不接收用户提供的任意 URL。清单最多 256 Ki 字符，清单内资源必须为绝对 HTTPS 地址；暂不支持需要继续中转的多码率子清单或 HTTP 分片。现有 HTTPS 视频沿用原播放方式。

平台发布前需要保存脚本并登记该主机的出站白名单；两项均须通过平台确认流程。前端应在后端生效后推送 `main` 发布。

~~~sh
node --check scripts/HBTV_VIDEO_API.web-hls.js
node --test scripts/web-playback.test.mjs
npm run build
~~~

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
