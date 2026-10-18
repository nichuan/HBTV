"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Clapperboard, Loader2, Play, Search, X } from "lucide-react";
import { API_BASE_URL } from "./config";
import type { Episode, VideoCard, VideoDetail } from "./types";
import "./styles.css";

type Playing = { url: string; episode: Episode } | null;

async function json<T>(response: Response): Promise<T> {
  const data = await response.json() as { error?: string } & T;
  if (!response.ok || data.error) throw new Error(data.error || "请求失败，请稍后再试");
  return data as T;
}

function Player({ playing }: { playing: Playing }) {
  const element = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const video = element.current;
    if (!playing || !video) return;
    let cancelled = false;
    let hls: { destroy(): void } | undefined;
    if (/\.m3u8(?:\?|$)/i.test(playing.url) && !video.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setFailed(true); return; }
        const instance = new Hls(); hls = instance;
        instance.loadSource(playing.url); instance.attachMedia(video);
        instance.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setFailed(true); });
        video.play().catch(() => {});
      }).catch(() => setFailed(true));
    } else { video.src = playing.url; video.load(); video.play().catch(() => {}); }
    return () => { cancelled = true; hls?.destroy(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [playing]);
  if (!playing) return <div className="player-empty"><span className="player-mark"><Play size={28} fill="currentColor" /></span><span>选择分集开始播放</span></div>;
  return <div className="player-content"><video ref={element} controls playsInline preload="metadata" onError={() => setFailed(true)} />{failed && <div className="player-failure">浏览器无法播放此片源。<a href={playing.url} target="_blank" rel="noreferrer">在新窗口打开 <ArrowUpRight size={14} /></a></div>}</div>;
}

function Cover({ item }: { item: VideoCard }) {
  return <div className="cover"><span className="cover-fallback"><Clapperboard size={31} /></span>{item.cover && <img src={item.cover} alt={`${item.name} 海报`} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}{item.remark && <span className="cover-label">{item.remark}</span>}</div>;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<VideoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [source, setSource] = useState("");
  const [playing, setPlaying] = useState<Playing>(null);
  const [playLoading, setPlayLoading] = useState("");
  const [playError, setPlayError] = useState("");
  const playRequest = useRef(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    const id = Number(params.get("id"));
    if (q) { setInput(q); setQuery(q); }
    if (Number.isSafeInteger(id) && id > 0) setSelectedId(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`${API_BASE_URL}/api/catalog?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal })
      .then((response) => json<{ items: VideoCard[] }>(response))
      .then((data) => { setItems((before) => page === 1 ? data.items : [...before, ...data.items.filter((item) => !before.some((old) => old.id === item.id))]); setHasMore(data.items.length >= 24); })
      .catch((cause) => { if (cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, reload]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetail(null); setDetailError(""); setDetailLoading(true); setPlaying(null); setPlayError("");
    fetch(`${API_BASE_URL}/api/detail?id=${selectedId}`, { signal: controller.signal })
      .then((response) => json<VideoDetail>(response))
      .then((data) => { setDetail(data); setSource(data.episodes[0]?.source || ""); })
      .catch((cause) => { if (cause.name !== "AbortError") setDetailError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, reload]);

  useEffect(() => { document.body.style.overflow = selectedId ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [selectedId]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  function url(q: string, id?: number | null) { const next = new URL(window.location.href); if (q) next.searchParams.set("q", q); else next.searchParams.delete("q"); if (id) next.searchParams.set("id", String(id)); else next.searchParams.delete("id"); window.history.pushState({}, "", next); }
  function search(event?: FormEvent) { event?.preventDefault(); const q = input.trim(); setQuery(q); setPage(1); setItems([]); setHasMore(false); setSelectedId(null); url(q); if (q === query) setReload((n) => n + 1); }
  function open(id: number) { setSelectedId(id); url(query, id); }
  function close() { playRequest.current++; setSelectedId(null); setDetail(null); setPlaying(null); setPlayLoading(""); url(query); }
  async function choose(episode: Episode) {
    const id = ++playRequest.current;
    setPlayLoading(`${episode.source}:${episode.path}`); setPlayError(""); setPlaying(null);
    try { const response = await fetch(`${API_BASE_URL}/api/play`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: episode.source, path: episode.path }) }); const data = await json<{ url: string }>(response); if (id === playRequest.current) setPlaying({ url: data.url, episode }); }
    catch (cause) { if (id === playRequest.current) setPlayError(cause instanceof Error ? cause.message : "播放地址获取失败"); }
    finally { if (id === playRequest.current) setPlayLoading(""); }
  }

  const sources = detail ? [...new Map(detail.episodes.map((episode) => [episode.source, episode.sourceName])).entries()] : [];
  const episodes = detail?.episodes.filter((episode) => episode.source === source) || [];
  const featured = items[0];

  return <main className="site-shell">
    <header className="site-header"><div className="header-inner">
      <button className="brand" type="button" onClick={() => { setInput(""); setQuery(""); setPage(1); setItems([]); setSelectedId(null); url(""); setReload((n) => n + 1); }} aria-label="返回首页"><span className="brand-icon"><Play size={18} fill="currentColor" /></span><span className="brand-name">憨包TV<span>简洁版</span></span></button>
      <form className="search-form" onSubmit={search} role="search"><Search size={19} className="search-icon" /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="搜索电影、剧集、动漫或演员" aria-label="搜索视频" />{input && <button className="clear-input" type="button" aria-label="清除搜索" onClick={() => setInput("")}><X size={16} /></button>}<button className="search-submit" type="submit">搜索</button></form>
      <span className="header-note"><i /> 实时片库</span>
    </div></header>
    <div className="page-body">
      {!query && featured && <section className="hero" aria-label="推荐视频"><div className="hero-art" style={{ backgroundImage: `linear-gradient(90deg,#11100f 0%,rgba(17,16,15,.96) 38%,rgba(17,16,15,.66) 76%,rgba(17,16,15,.50) 100%),url("${featured.cover.replaceAll('"', '%22')}")` }} /><div className="hero-content"><span className="eyebrow"><i /> 为你精选</span><h1>{featured.name}</h1><div className="hero-meta"><span>{featured.year || "新片"}</span><span>{featured.area || "影视"}</span><span>{featured.category?.split(",").slice(0, 2).join(" · ")}</span></div><p>{featured.brief || "发现更多好看的电影和剧集。"}</p><button className="hero-button" type="button" onClick={() => open(featured.id)}><Play size={17} fill="currentColor" /> 查看分集 <ChevronRight size={16} /></button></div><div className="hero-number">01 <span>/ 推荐</span></div></section>}
      <section className="results-section" aria-live="polite"><div className="section-heading"><div><span className="section-kicker">EXPLORE THE LIBRARY</span><h2>{query ? `“${query}” 的搜索结果` : "最近更新"}</h2></div><span className="section-summary">{loading && page === 1 ? "正在加载…" : `${items.length} 部作品`}</span></div>
        {error && <div className="message-box"><p>{error}</p><button type="button" onClick={() => setReload((n) => n + 1)}>重试</button></div>}
        {!error && items.length === 0 && loading && <div className="video-grid" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <div className="skeleton-card" key={i}><div /><span /><span /></div>)}</div>}
        {!error && items.length === 0 && !loading && <div className="empty-state"><Search size={30} /><h3>暂时没有找到结果</h3><p>试试作品全名，或换一个关键词。</p></div>}
        {items.length > 0 && <div className="video-grid">{items.map((item) => <button type="button" className="video-card" key={item.id} onClick={() => open(item.id)}><Cover item={item} /><span className="card-title">{item.name}</span><span className="card-meta">{item.year || "—"} <span>·</span> {item.category?.split(",")[0] || item.area || "影视"}</span></button>)}</div>}
        {items.length > 0 && hasMore && <button className="more-button" disabled={loading} type="button" onClick={() => setPage((n) => n + 1)}>{loading ? <><Loader2 className="spin" size={17} /> 加载中</> : <>加载更多 <ChevronRight size={17} /></>}</button>}
      </section><footer className="site-footer"><span>憨包TV · 简洁版</span><span>片目与播放地址来自应用当前接口，实际可用性取决于片源。</span></footer>
    </div>
    {selectedId && <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={detail?.name || "视频详情"}><button className="overlay-backdrop" onClick={close} aria-label="关闭详情" /><div className="detail-panel"><div className="detail-topbar"><button type="button" onClick={close}><ArrowLeft size={18} /> 返回片库</button><button className="detail-close" type="button" onClick={close} aria-label="关闭"><X size={20} /></button></div>
      {detailLoading && <div className="detail-loading"><Loader2 size={30} className="spin" /><span>正在获取完整分集…</span></div>}
      {detailError && <div className="detail-loading"><span>{detailError}</span><button type="button" onClick={() => setReload((n) => n + 1)}>重试</button></div>}
      {detail && <div className="detail-body"><div className="detail-main"><div className="player-frame"><Player playing={playing} />{playLoading && <div className="player-loading"><Loader2 className="spin" size={24} /> 正在解析播放地址…</div>}</div>{playError && <div className="play-error">{playError}</div>}<div className="detail-title-row"><div><span className="detail-kicker">NOW SHOWING</span><h2>{detail.name}</h2></div><span className="detail-remark">{detail.remark || "影视"}</span></div><div className="detail-tags">{[detail.year, detail.area, ...detail.category.split(",").slice(0, 3)].filter(Boolean).map((tag, i) => <span key={`${tag}-${i}`}>{tag}</span>)}</div><p className="detail-intro">{detail.intro || detail.brief || "暂无简介"}</p>{detail.director && <p className="people"><strong>导演</strong>{detail.director}</p>}{detail.actor && <p className="people"><strong>主演</strong>{detail.actor}</p>}</div><aside className="episode-pane"><div className="episode-title"><div><span className="detail-kicker">EPISODES</span><h3>选集播放</h3></div><span>{episodes.length} 集</span></div>{sources.length > 1 && <div className="source-tabs" role="tablist" aria-label="播放源">{sources.map(([key, name]) => <button type="button" role="tab" aria-selected={source === key} className={source === key ? "active" : ""} key={key} onClick={() => { setSource(key); setPlaying(null); setPlayError(""); }}>{name}</button>)}</div>}{episodes.length === 0 ? <p className="no-episodes">暂无可用分集</p> : <div className="episode-grid">{episodes.map((episode, index) => { const active = playing?.episode.path === episode.path && playing?.episode.source === episode.source; const busy = playLoading === `${episode.source}:${episode.path}`; return <button type="button" className={`episode-button ${active ? "active" : ""}`} key={`${episode.path}-${index}`} onClick={() => choose(episode)} title={`${episode.sourceName} · ${episode.title}`}>{busy ? <Loader2 size={16} className="spin" /> : active ? <Play size={13} fill="currentColor" /> : null}<span>{episode.title || `第${episode.episode || index + 1}集`}</span></button>; })}</div>}<p className="episode-note">部分片源可能因格式或失效而无法在浏览器播放，可尝试切换播放源。</p></aside></div>}
    </div></div>}
  </main>;
}
