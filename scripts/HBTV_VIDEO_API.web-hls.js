/*
 * HBTV API Publish script.
 * API Publish input: { method, parameter, header, body }
 * GET:  ?action=catalog&q=...&page=... or ?action=detail&id=...
 * POST: { action: "play", source: "...", path: "..." }
 */

var APP = {
  pkg: "com.dasjkjfd.mgd",
  version: "3065",
  md5: "3A4A23871C21D1F00D75C58AB5F688F8",
  sha1: "8F2E5859B53F5F488F7021A07B7EFA62EB8FEDBD"
};
var MarmotBridge = require("@M/bridge").MarmotBridge;
var crypt = MarmotBridge.get("_crypt");
var base64Crypt = MarmotBridge.get("_base64_crypt");
var httpClient = MarmotBridge.get("_http_client");
var PARTS = {
  "3": "YT7MFs7DrSmwAwmTKbAK47GUyZpcPaaBswKoP9ex7XMCz8trus8GdDpBt80GqAk2",
  "4": "IZqqsqXdVNmR9N/QzBr3mYxNdgMF8R3xj5y9zlyRPDcUO5k9dxnY3OXSxX1vRvH6mMTeOA7JFlkPA1I+ZlfEzLA5xknBP4AvUs3R4hQ6axvJIUief0sx4TR/3cxHlZdGHUHKX/ISqzuRP97T271Eu10FL6cFzAvxt28Rw5DIZ0si5X3GlPjiI68JwMlSi5f7bs8htWQlzatRhhu7wnclQW5+gMiZmw/ydRaaw5eotXkQdIGiXUY6Y6g60Qapw8Rdq25fIIK4SS6kwJJYk20e83zTLafR9GOAK27EpY74G/Y=",
  "7": "AWSS@E",
  "8": "11GK2w",
  "9": "e32144",
  "10": "AAA112",
  "11": "LO&hil",
  "12": "U*Yjgt",
  "13": "UITB)F"
};

var UPSTREAM = "https://juziapp.hzhcbkj.cn";
var BOOTSTRAP = "https://123-1349250429.cos.ap-shanghai.myqcloud.com/app.txt";
var APP_ORIGIN = "https://nichuan.github.io";
var CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "Cache-Control": "no-store"
};

function utf8Bytes(value) {
  var binary = unescape(encodeURIComponent(String(value)));
  var bytes = [];
  for (var i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i));
  return bytes;
}

function utf8Text(binary) {
  var escaped = "";
  for (var i = 0; i < binary.length; i++) {
    var hex = binary.charCodeAt(i).toString(16);
    escaped += "%" + (hex.length < 2 ? "0" : "") + hex;
  }
  try { return decodeURIComponent(escaped); }
  catch (e) { return binary; }
}

function concatBytes(parts) {
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    for (var j = 0; j < parts[i].length; j++) result.push(parts[i][j]);
  }
  return result;
}

function bytesToBinary(bytes) {
  var result = "";
  for (var i = 0; i < bytes.length; i += 4096) {
    var end = Math.min(bytes.length, i + 4096);
    for (var j = i; j < end; j++) result += String.fromCharCode(bytes[j]);
  }
  return result;
}

function varint(value) {
  var n = Number(value);
  if (!isFinite(n) || n < 0) throw new Error("视频数据格式不正确");
  var bytes = [];
  while (n > 127) {
    bytes.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
  return bytes;
}

function stringField(field, value) {
  var bytes = utf8Bytes(value);
  return concatBytes([varint(field * 8 + 2), varint(bytes.length), bytes]);
}

function numberField(field, value) {
  return concatBytes([varint(field * 8), varint(value)]);
}

function readVarint(binary, start) {
  var value = 0, multiplier = 1, offset = start;
  for (var i = 0; i < 10 && offset < binary.length; i++) {
    var byte = binary.charCodeAt(offset++);
    value += (byte & 127) * multiplier;
    if ((byte & 128) === 0) return [value, offset];
    multiplier *= 128;
  }
  throw new Error("视频数据格式不正确");
}

function parseProto(binary) {
  var fields = [], offset = 0;
  while (offset < binary.length) {
    var tagPair = readVarint(binary, offset);
    var tag = tagPair[0];
    offset = tagPair[1];
    var id = Math.floor(tag / 8), wire = tag & 7;
    if (!id || fields.length > 30000) throw new Error("视频数据格式不正确");
    if (wire === 0) {
      var numberPair = readVarint(binary, offset);
      fields.push({ id: id, wire: wire, value: numberPair[0] });
      offset = numberPair[1];
    } else if (wire === 2) {
      var lengthPair = readVarint(binary, offset);
      var length = lengthPair[0], begin = lengthPair[1];
      if (length < 0 || begin + length > binary.length) throw new Error("视频数据格式不正确");
      fields.push({ id: id, wire: wire, value: binary.substring(begin, begin + length) });
      offset = begin + length;
    } else if (wire === 5 || wire === 1) {
      var fixedLength = wire === 5 ? 4 : 8;
      if (offset + fixedLength > binary.length) throw new Error("视频数据格式不正确");
      fields.push({ id: id, wire: wire, value: binary.substring(offset, offset + fixedLength) });
      offset += fixedLength;
    } else throw new Error("视频数据格式不正确");
  }
  return fields;
}

function all(fields, id) {
  return fields.filter(function (field) { return field.id === id; });
}

function one(fields, id) {
  return all(fields, id)[0];
}

function text(fields, id) {
  var field = one(fields, id);
  return field && typeof field.value === "string" ? utf8Text(field.value) : "";
}

function num(fields, id) {
  var field = one(fields, id);
  return field && typeof field.value === "number" ? field.value : 0;
}

function nested(fields, id) {
  var field = one(fields, id);
  return field && typeof field.value === "string" ? parseProto(field.value) : [];
}

function randomString(length) {
  var alphabet = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var seen = {}, result = "";
  while (result.length < length - 1) {
    var char = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    if (!seen[char]) { seen[char] = true; result += char; }
  }
  return result + "=";
}

function aesKey(value) {
  // Marmot's AES bridge treats key strings as Base64 when possible. Wrap raw
  // APK keys so valid-looking keys such as SAFE_CODE are not decoded as bytes.
  return base64Crypt.encrypt(String(value), "UTF-8");
}

function appSecret() {
  var embedded = PARTS[7] + PARTS[10] + PARTS[12] + PARTS[13] + "Md1khdaF";
  return crypt.javaAesDecrypt(PARTS[3], aesKey(embedded));
}

var SECRET = appSecret();
var SAFE_CODE = (function () {
  var key = PARTS[8] + PARTS[9] + PARTS[11] + PARTS[13] + "Md1khdaF";
  var signer = APP.md5 + "######" + APP.sha1 + "~~~~~~" + APP.pkg + ">>>+++" + APP.version;
  var encrypted = crypt.javaAesEncrypt(signer, aesKey(key));
  var signerBase64 = base64Crypt.encrypt(encrypted, "UTF-8");
  return (signerBase64.substring(0, 16) + signerBase64.substring(signerBase64.length - 16)).toUpperCase();
})();

function rsaEncrypt(publicKey, value) {
  return crypt.javaRsaEncryptWithPublic(String(value), publicKey);
}

function baseUrl() {
  // COS 提供域名更新；只有当前已登记的上游域名会被采用，避免把脚本变成任意 URL 代理。
  try {
    var raw = httpGet(BOOTSTRAP, { "Accept": "application/json" });
    var data = JSON.parse(raw);
    if (data.enabled && data.domain) {
      var match = /^https:\/\/([^/:]+)(?::\d+)?(?:\/|$)/i.exec(String(data.domain));
      if (match && match[1].toLowerCase() === "juziapp.hzhcbkj.cn") return UPSTREAM;
    }
  } catch (e) { /* use the APK's observed fallback domain */ }
  return UPSTREAM;
}

function publicParams() {
  return { plat: "android", v: "1", vApp: APP.version, pkg: APP.pkg, chid: "10000" };
}

function httpGet(url, headers) {
  var h = headers || {};
  return httpClient.doGet(JSON.stringify({ url: url, authorization: { type: "DEFAULT" } }), JSON.stringify(h));
}

function httpPostProto(url, body, params) {
  var headers = {
    "Content-Type": "application/x-protobuf; charset=ISO-8859-1",
    "Accept": "application/x-protobuf",
    "Accept-Charset": "ISO-8859-1",
    "publicParams": JSON.stringify(params)
  };
  return httpClient.doPost(JSON.stringify({ url: url, authorization: { type: "DEFAULT" } }), JSON.stringify(headers), bytesToBinary(body));
}

function postProto(path, body, params) {
  var response = httpPostProto(baseUrl() + path, body, params);
  var fields = parseProto(response);
  if (num(fields, 1) !== 200) throw new Error(text(fields, 2) || "视频接口返回错误");
  return fields;
}

function secondPublic() {
  var timestamp = Date.now(), random = randomString(16);
  var body = concatBytes([
    numberField(1, timestamp),
    stringField(2, rsaEncrypt(utf8Text(crypt.javaAesDecrypt(PARTS[4], aesKey(PARTS[7] + PARTS[10] + PARTS[12] + PARTS[13] + "Md1khdaF"))), String(timestamp) + random)),
    stringField(3, randomString(16)),
    stringField(4, random),
    stringField(5, randomString(16))
  ]);
  var envelope = postProto("/api/v5/find/app/zone", body, publicParams());
  var dataField = one(envelope, 3);
  if (!dataField || typeof dataField.value !== "string") throw new Error("无法获取视频接口密钥");
  var parts = parseProto(dataField.value);
  var key = [2, 3, 4, 5].map(function (id) { return text(parts, id); }).join("");
  if (key.length < 100) throw new Error("视频接口密钥格式不正确");
  return key;
}

function signedParams() {
  var key = secondPublic(), timestamp = Date.now(), random = randomString(16);
  var sig = rsaEncrypt(key, String(timestamp) + random + APP.version);
  var secondSig = crypt.javaAesEncrypt(String(timestamp) + random, aesKey(SECRET));
  return Object.assign({}, publicParams(), {
    timestamp: timestamp,
    random_str: random,
    sig: sig,
    sig2: secondSig.substring(0, 8),
    sig3: secondSig.substring(8)
  });
}

function secureProto(path, params) {
  var timestamp = Date.now(), random = randomString(8);
  var query = Object.keys(params).map(function (key) { return key + "=" + params[key]; }).join("&");
  var encrypted = crypt.javaAesEncrypt(query + timestamp, aesKey(SAFE_CODE));
  var combined = random + encrypted;
  var body = concatBytes([
    stringField(1, combined.substring(0, 20)),
    stringField(2, combined.substring(20)),
    stringField(3, randomString(20)),
    numberField(4, timestamp),
    stringField(5, random)
  ]);
  var envelope = postProto(path, body, signedParams());
  var dataField = one(envelope, 3);
  if (!dataField || typeof dataField.value !== "string") throw new Error("视频接口没有返回数据");
  return parseProto(dataField.value);
}

function legacyGet(path, params) {
  var query = Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
  }).join("&");
  var response = httpGet(UPSTREAM + path + (query ? "?" + query : ""), {
    "publicParams": JSON.stringify(publicParams()),
    "Accept": "application/json"
  });
  var result = JSON.parse(response);
  if (result.code !== 200 || !result.data) throw new Error(result.msg || "视频接口返回错误");
  return JSON.parse(crypt.javaAesDecrypt(crypt.javaAesDecrypt(result.data, aesKey(SAFE_CODE)), aesKey(SECRET)));
}

function plain(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cardFromProto(fields) {
  var cover = nested(fields, 2);
  return {
    id: num(fields, 3), name: text(fields, 5), cover: text(cover, 1) || text(cover, 2),
    year: num(fields, 14), area: text(fields, 1), remark: text(fields, 13),
    category: text(fields, 15), brief: plain(text(fields, 4))
  };
}

function cardFromJson(item) {
  var cover = item.coverImage || {};
  return {
    id: Number(item.id) || 0, name: String(item.name || ""), cover: String(cover.path || ""),
    year: Number(item.year) || 0, area: String(item.area || ""), remark: String(item.remark || ""),
    category: String(item.clazz || ""), brief: plain(item.brief)
  };
}

function listVideos(query, page) {
  if (query) {
    var fields = secureProto("/api/proto/v5/drama/search", { searchKeys: query, page: String(page), pagesize: "24" });
    return all(fields, 1).map(function (field) {
      return typeof field.value === "string" ? cardFromProto(parseProto(field.value)) : null;
    }).filter(function (item) { return item !== null; });
  }
  var data = legacyGet("/api/ex/v3/security/drama/list", { page: String(page), pagesize: "24" });
  return (data.list || []).map(cardFromJson);
}

function getVideoDetail(id) {
  var fields = secureProto("/api/proto/v5/drama/getDetail", { id: String(id) });
  var episodes = all(fields, 29).map(function (field) {
    if (typeof field.value !== "string") return null;
    var ep = parseProto(field.value);
    return {
      title: text(ep, 2) || text(ep, 3) || "播放", episode: num(ep, 13), season: num(ep, 12),
      source: text(ep, 9), sourceName: text(ep, 10) || text(ep, 9), path: text(ep, 4), vip: num(ep, 14) === 1
    };
  }).filter(function (ep) { return ep && ep.path; });
  var cover = text(nested(fields, 2), 1);
  return {
    id: num(fields, 4), name: text(fields, 9), cover: cover, year: num(fields, 18), area: text(fields, 1),
    remark: text(fields, 26), category: text(fields, 13), brief: plain(text(fields, 7)),
    actor: text(fields, 25), director: text(fields, 12), intro: plain(text(fields, 6)), episodes: episodes
  };
}

function getPlayUrl(source, path) {
  var fields = secureProto("/api/proto/v5/videoUsableUrl", {
    vodPlayFrom: source,
    playUrl: encodeURIComponent(path)
  });
  var url = text(fields, 1);
  if (!/^https?:\/\//i.test(url)) throw new Error(text(fields, 9) || "当前片源没有网页可播放的地址");
  return { url: url, direct: num(fields, 5) === 1 };
}


function prepareWebPlayback(playback) {
  // Only bridge the observed HTTP manifest endpoint; never accept a client-supplied URL.
  if (!/^http:\/\//i.test(playback.url)) return playback;
  if (!/^http:\/\/122\.228\.193\.79:3721\/api\/\?[^#\s]*$/i.test(playback.url)) {
    throw new Error("此播放源暂不支持 HTTPS 网页，请切换其他播放源");
  }
  var playlist = String(httpGet(playback.url, {
    "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain",
    "Range": "bytes=0-262143"
  })).replace(/^\uFEFF/, "");
  if (playlist.length > 262144 || !/^#EXTM3U(?:\r?\n|$)/.test(playlist) || !/#EXTINF:/.test(playlist) || /#EXT-X-STREAM-INF:|#EXT-X-MEDIA:/.test(playlist)) {
    throw new Error("此播放源未返回可用的视频清单，请切换播放源");
  }
  function secureResource(uri) {
    if (!/^https:\/\/[a-z0-9.-]+(?::443)?(?:\/|$)/i.test(uri)) {
      throw new Error("此播放源包含网页无法访问的分片，请切换播放源");
    }
    return uri;
  }
  var lines = playlist.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.charAt(0) === "#") {
      line.replace(/URI="([^"]+)"/g, function (_, uri) { secureResource(uri); return _; });
    } else secureResource(line);
  }
  return { url: playback.url, direct: playback.direct, format: "hls", playlist: playlist };
}

function output(value) {
  return { body: JSON.stringify(value), header: CORS_HEADERS };
}

function process(input) {
  var method = String(input && input.method || "GET").toUpperCase();
  if (method === "OPTIONS") return { body: "", header: CORS_HEADERS };

  var parameter = input && input.parameter || {};
  var body = input && input.body || "";
  var request = {};
  if (method === "POST") {
    try { request = typeof body === "string" ? JSON.parse(body || "{}") : body || {}; }
    catch (e) { return output({ error: "播放参数无效" }); }
  }
  var action = String(request.action || parameter.action || "");

  try {
    if (action === "catalog") {
      var query = String(parameter.q || request.q || "").trim().substring(0, 80);
      var page = Math.max(1, Math.min(1000, Number(parameter.page || request.page) || 1));
      return output({ items: listVideos(query, page), page: page, query: query });
    }
    if (action === "detail") {
      var id = Number(parameter.id || request.id);
      if (!isFinite(id) || Math.floor(id) !== id || id < 1) return output({ error: "视频编号无效" });
      return output(getVideoDetail(id));
    }
    if (action === "play") {
      var source = String(request.source || ""), path = String(request.path || "");
      if (!source || !path || source.length > 100 || path.length > 3000) return output({ error: "播放参数无效" });
      var playback = getPlayUrl(source, path);
      return output(request.webPlayback === true ? prepareWebPlayback(playback) : playback);
    }
    return output({ error: "不支持的 API 操作" });
  } catch (error) {
    var message = error && error.message ? String(error.message) : "视频接口暂时不可用";
    if (/MarmotScript HttpClient|Outbound|Unknown Host|timeout|timed out/i.test(message)) message = "视频接口暂时不可用，请稍后重试";
    return output({ error: message.substring(0, 180) });
  }
}

