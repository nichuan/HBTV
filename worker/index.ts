import { getPlayUrl, getVideoDetail, listVideos } from "./lib/juzi";

const allowedOrigins = new Set([
  "https://nichuan.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function json(request: Request, value: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  return new Response(JSON.stringify(value), { status, headers });
}

function options(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function message(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : fallback;
  if (/Unknown Host|timeout|timed out|fetch failed/i.test(text)) return "视频接口暂时不可用，请稍后重试";
  return text.slice(0, 180);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return options(request);
    if (url.pathname === "/health") return json(request, { ok: true, service: "hbtv-video-api" });

    if (url.pathname === "/api/catalog") {
      if (request.method !== "GET") return json(request, { error: "请求方法不支持" }, 405);
      const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
      const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
      try {
        const items = await listVideos(query, page);
        return json(request, { items, page, query });
      } catch (error) {
        return json(request, { error: message(error, "检索暂时不可用") }, 502);
      }
    }

    if (url.pathname === "/api/detail") {
      if (request.method !== "GET") return json(request, { error: "请求方法不支持" }, 405);
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id < 1) return json(request, { error: "视频编号无效" }, 400);
      try {
        return json(request, await getVideoDetail(id));
      } catch (error) {
        return json(request, { error: message(error, "详情暂时不可用") }, 502);
      }
    }

    if (url.pathname === "/api/play") {
      if (request.method !== "POST") return json(request, { error: "请求方法不支持" }, 405);
      let body: { source?: unknown; path?: unknown };
      try {
        body = await request.json() as { source?: unknown; path?: unknown };
      } catch {
        return json(request, { error: "播放参数无效" }, 400);
      }
      const source = typeof body.source === "string" ? body.source : "";
      const path = typeof body.path === "string" ? body.path : "";
      if (!source || !path || source.length > 100 || path.length > 3000) {
        return json(request, { error: "播放参数无效" }, 400);
      }
      try {
        return json(request, await getPlayUrl(source, path));
      } catch (error) {
        return json(request, { error: message(error, "当前片源无法播放") }, 502);
      }
    }

    return json(request, { error: "未找到接口" }, 404);
  },
};
