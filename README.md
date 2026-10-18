# 憨包TV（HBTV）

一个简洁的视频检索与播放网页，支持实时片库、关键词搜索、视频详情、播放源切换和分集播放。

## 本地预览

```sh
npm ci
npm run dev
```

## 发布

推送到 `main` 分支后，GitHub Actions 会构建静态文件并发布到 GitHub Pages。

前端只包含浏览器页面。实时检索和播放地址解析由独立的 HBTV API 服务提供。
