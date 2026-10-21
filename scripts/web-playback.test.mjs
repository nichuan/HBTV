import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./HBTV_VIDEO_API.web-hls.js", import.meta.url), "utf8");
const helper = source.slice(source.indexOf("function prepareWebPlayback("), source.indexOf("function output(value)"));
const endpoint = "http://122.228.193.79:3721/api/?time=1&vkey=test";
const playlist = "#EXTM3U\n#EXTINF:6,\nhttps://cdn.example/segment.png\n#EXT-X-ENDLIST\n";
function prepare(httpGet) {
  return vm.runInNewContext(helper + "\nprepareWebPlayback", { httpGet });
}

test("无后缀且 MIME 错误的 HLS 入口只读取清单，视频分片保持 HTTPS 直连", () => {
  const requests = [];
  const result = prepare((url) => { requests.push(url); return playlist; })({ url: endpoint, direct: false });
  assert.deepEqual(requests, [endpoint]);
  assert.equal(result.format, "hls");
  assert.equal(result.playlist, playlist);
  assert.ok(result.playlist.includes("https://cdn.example/segment.png"));
});

test("拒绝任意转发目标、非清单内容和浏览器无法安全读取的资源", () => {
  let requests = 0;
  const resolve = prepare(() => { requests++; return playlist; });
  for (const url of ["http://127.0.0.1/", "http://122.228.193.79:3721/video.mp4", "http://example.com/api/"]) {
    assert.throws(() => resolve({ url }));
  }
  assert.equal(requests, 0);
  for (const body of ["<html>error</html>", playlist.replace("https:", "http:"), playlist.replace("https://cdn.example", "https://user:password@cdn.example"), playlist + "x".repeat(262144)]) {
    assert.throws(() => prepare(() => body)({ url: endpoint }));
  }
});

test("已有 HTTPS 视频继续使用原来的播放地址", () => {
  const playback = { url: "https://cdn.example/video.mp4", direct: true };
  assert.equal(prepare(() => { throw Error("不应中转 HTTPS 视频"); })(playback), playback);
});
