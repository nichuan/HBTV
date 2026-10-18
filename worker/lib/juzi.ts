import { createCipheriv, createDecipheriv, publicEncrypt, constants } from "node:crypto";
import { APP_PARTS } from "./app-parts";

const app = {
  pkg: "com.dasjkjfd.mgd",
  version: "3065",
  md5: "3A4A23871C21D1F00D75C58AB5F688F8",
  sha1: "8F2E5859B53F5F488F7021A07B7EFA62EB8FEDBD",
};
const bootstrapUrl = "https://123-1349250429.cos.ap-shanghai.myqcloud.com/app.txt";
const fallbackDomain = "https://juziapp.hzhcbkj.cn";
const part = (n: number) => APP_PARTS[String(n) as keyof typeof APP_PARTS];
const embeddedKey = part(7) + part(10) + part(12) + part(13) + "Md1khdaF";

function aesDecrypt(key: string, ciphertext: string): string {
  const cipher = createDecipheriv("aes-256-ecb", Buffer.from(key), Buffer.alloc(0));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64")), cipher.final()]).toString("utf8");
}

function aesEncrypt(key: string, plaintext: string): string {
  const cipher = createCipheriv("aes-256-ecb", Buffer.from(key), Buffer.alloc(0));
  return Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]).toString("base64");
}

const secret = aesDecrypt(embeddedKey, part(3));
const firstPublic = aesDecrypt(embeddedKey, part(4));
const signer = `${app.md5}######${app.sha1}~~~~~~${app.pkg}>>>+++${app.version}`;
const signerEncoded = aesEncrypt(part(8) + part(9) + part(11) + part(13) + "Md1khdaF", signer);
const signerBase64 = Buffer.from(signerEncoded).toString("base64");
const safeCode = (signerBase64.slice(0, 16) + signerBase64.slice(-16)).toUpperCase();

function rsaEncrypt(key: string, value: string): string {
  const pem = `-----BEGIN PUBLIC KEY-----\n${key.match(/.{1,64}/g)?.join("\n") || key}\n-----END PUBLIC KEY-----`;
  return publicEncrypt({
    key: pem,
    padding: constants.RSA_PKCS1_PADDING,
  }, Buffer.from(value, "utf8")).toString("base64");
}

function randomString(length: number): string {
  const alphabet = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const chars = new Set<string>();
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  while (chars.size < length - 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(Math.max(16, length)));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      chars.add(alphabet[byte % alphabet.length]);
      if (chars.size >= length - 1) break;
    }
  }
  return [...chars].join("") + "=";
}

function varint(value: number): Buffer {
  let n = BigInt(value);
  const bytes: number[] = [];
  while (n >= 128n) { bytes.push(Number(n & 127n) | 128); n >>= 7n; }
  bytes.push(Number(n));
  return Buffer.from(bytes);
}

function stringField(field: number, value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
}

function numberField(field: number, value: number): Buffer {
  return Buffer.concat([varint(field * 8), varint(value)]);
}

type Field = { id: number; wire: number; value: number | Buffer };

function readVarint(bytes: Buffer, start: number): [number, number] {
  let value = 0n, shift = 0n, offset = start;
  while (offset < bytes.length && shift < 70n) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) return [Number(value), offset];
    shift += 7n;
  }
  throw new Error("视频数据格式不正确");
}

function parseProto(bytes: Buffer): Field[] {
  const fields: Field[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, next] = readVarint(bytes, offset);
    offset = next;
    const id = tag >>> 3, wire = tag & 7;
    if (!id || fields.length > 30000) throw new Error("视频数据格式不正确");
    if (wire === 0) {
      const [value, end] = readVarint(bytes, offset);
      fields.push({ id, wire, value }); offset = end;
    } else if (wire === 2) {
      const [length, end] = readVarint(bytes, offset);
      if (length < 0 || end + length > bytes.length) throw new Error("视频数据格式不正确");
      fields.push({ id, wire, value: bytes.subarray(end, end + length) });
      offset = end + length;
    } else if (wire === 5 || wire === 1) {
      const length = wire === 5 ? 4 : 8;
      if (offset + length > bytes.length) throw new Error("视频数据格式不正确");
      fields.push({ id, wire, value: bytes.subarray(offset, offset + length) });
      offset += length;
    } else throw new Error("视频数据格式不正确");
  }
  return fields;
}

const all = (fields: Field[], id: number) => fields.filter((field) => field.id === id);
const one = (fields: Field[], id: number) => all(fields, id)[0];
const text = (fields: Field[], id: number) => {
  const value = one(fields, id)?.value;
  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
};
const num = (fields: Field[], id: number) => {
  const value = one(fields, id)?.value;
  return typeof value === "number" ? value : 0;
};
const nested = (fields: Field[], id: number) => {
  const value = one(fields, id)?.value;
  return Buffer.isBuffer(value) ? parseProto(value) : [];
};

let domainCache: { value: string; until: number } | undefined;
async function domain(): Promise<string> {
  if (domainCache && domainCache.until > Date.now()) return domainCache.value;
  let value = fallbackDomain;
  try {
    const response = await fetch(bootstrapUrl, { signal: AbortSignal.timeout(4000) });
    const body = await response.json() as { domain?: string; enabled?: boolean };
    if (body.enabled && body.domain) {
      const parsed = new URL(body.domain);
      if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "juziapp.hzhcbkj.cn") value = parsed.origin;
    }
  } catch { /* The APK's last observed domain is a usable fallback. */ }
  domainCache = { value, until: Date.now() + 10 * 60_000 };
  return value;
}

const publicParams = () => ({ plat: "android", v: "1", vApp: app.version, pkg: app.pkg, chid: "10000" });
let publicKeyCache: { key: string; until: number } | undefined;

async function postProto(path: string, body: Buffer, params: Record<string, unknown>): Promise<Field[]> {
  const response = await fetch((await domain()) + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-protobuf", Accept: "application/x-protobuf", publicParams: JSON.stringify(params) },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`视频接口暂时不可用 (${response.status})`);
  const fields = parseProto(Buffer.from(await response.arrayBuffer()));
  if (num(fields, 1) !== 200) throw new Error(text(fields, 2) || "视频接口返回错误");
  return fields;
}

async function secondPublic(): Promise<string> {
  if (publicKeyCache && publicKeyCache.until > Date.now()) return publicKeyCache.key;
  const timestamp = Date.now(), random = randomString(16);
  const body = Buffer.concat([
    numberField(1, timestamp), stringField(2, rsaEncrypt(firstPublic, String(timestamp) + random)),
    stringField(3, randomString(16)), stringField(4, random), stringField(5, randomString(16)),
  ]);
  const envelope = await postProto("/api/v5/find/app/zone", body, publicParams());
  const data = one(envelope, 3)?.value;
  if (!Buffer.isBuffer(data)) throw new Error("无法获取视频接口密钥");
  const parts = parseProto(data);
  const key = [2, 3, 4, 5].map((id) => text(parts, id)).join("");
  if (key.length < 100) throw new Error("视频接口密钥格式不正确");
  publicKeyCache = { key, until: Date.now() + 5 * 60_000 };
  return key;
}

async function signedParams(): Promise<Record<string, string | number>> {
  const key = await secondPublic();
  const timestamp = Date.now(), random = randomString(16);
  const sig = rsaEncrypt(key, String(timestamp) + random + app.version);
  const secondSig = aesEncrypt(secret, String(timestamp) + random);
  return { ...publicParams(), timestamp, random_str: random, sig, sig2: secondSig.slice(0, 8), sig3: secondSig.slice(8) };
}

async function secureProto(path: string, params: Record<string, string>): Promise<Field[]> {
  const timestamp = Date.now(), random = randomString(8);
  const query = Object.entries(params).map(([key, value]) => `${key}=${value}`).join("&");
  const encrypted = aesEncrypt(safeCode, query + timestamp);
  const combined = random + encrypted;
  const body = Buffer.concat([
    stringField(1, combined.slice(0, 20)), stringField(2, combined.slice(20)),
    stringField(3, randomString(20)), numberField(4, timestamp), stringField(5, random),
  ]);
  const envelope = await postProto(path, body, await signedParams());
  const data = one(envelope, 3)?.value;
  if (!Buffer.isBuffer(data)) throw new Error("视频接口没有返回数据");
  return parseProto(data);
}

async function legacyGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL((await domain()) + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { publicParams: JSON.stringify(publicParams()) }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`视频接口暂时不可用 (${response.status})`);
  const result = await response.json() as { code?: number; msg?: string; data?: string };
  if (result.code !== 200 || !result.data) throw new Error(result.msg || "视频接口返回错误");
  return JSON.parse(aesDecrypt(secret, aesDecrypt(safeCode, result.data)));
}

export type VideoCard = { id: number; name: string; cover: string; year: number; area: string; remark: string; category: string; brief: string };
export type Episode = { title: string; episode: number; season: number; source: string; sourceName: string; path: string; vip: boolean };
export type VideoDetail = VideoCard & { actor: string; director: string; intro: string; episodes: Episode[] };

function plain(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cardFromProto(fields: Field[]): VideoCard {
  const cover = nested(fields, 2);
  return { id: num(fields, 3), name: text(fields, 5), cover: text(cover, 1) || text(cover, 2), year: num(fields, 14), area: text(fields, 1), remark: text(fields, 13), category: text(fields, 15), brief: plain(text(fields, 4)) };
}

function cardFromJson(item: Record<string, unknown>): VideoCard {
  const cover = item.coverImage as { path?: string } | undefined;
  return { id: Number(item.id) || 0, name: String(item.name || ""), cover: cover?.path || "", year: Number(item.year) || 0, area: String(item.area || ""), remark: String(item.remark || ""), category: String(item.clazz || ""), brief: plain(String(item.brief || "")) };
}

export async function listVideos(query: string, page: number): Promise<VideoCard[]> {
  if (query.trim()) {
    const fields = await secureProto("/api/proto/v5/drama/search", { searchKeys: query.trim(), page: String(page), pagesize: "24" });
    return all(fields, 1).flatMap(({ value }) => Buffer.isBuffer(value) ? [cardFromProto(parseProto(value))] : []);
  }
  const data = await legacyGet("/api/ex/v3/security/drama/list", { page: String(page), pagesize: "24" }) as { list?: Record<string, unknown>[] };
  return (data.list || []).map(cardFromJson);
}

export async function getVideoDetail(id: number): Promise<VideoDetail> {
  const fields = await secureProto("/api/proto/v5/drama/getDetail", { id: String(id) });
  const episodes = all(fields, 29).flatMap(({ value }): Episode[] => {
    if (!Buffer.isBuffer(value)) return [];
    const ep = parseProto(value);
    return [{ title: text(ep, 2) || text(ep, 3) || "播放", episode: num(ep, 13), season: num(ep, 12), source: text(ep, 9), sourceName: text(ep, 10) || text(ep, 9), path: text(ep, 4), vip: num(ep, 14) === 1 }];
  }).filter((ep) => ep.path);
  const cover = text(nested(fields, 2), 1);
  return {
    id: num(fields, 4), name: text(fields, 9), cover, year: num(fields, 18), area: text(fields, 1),
    remark: text(fields, 26), category: text(fields, 13), brief: plain(text(fields, 7)),
    actor: text(fields, 25), director: text(fields, 12), intro: plain(text(fields, 6)), episodes,
  };
}

export async function getPlayUrl(source: string, path: string): Promise<{ url: string; direct: boolean }> {
  const fields = await secureProto("/api/proto/v5/videoUsableUrl", { vodPlayFrom: source, playUrl: encodeURIComponent(path) });
  const url = text(fields, 1);
  if (!/^https?:\/\//i.test(url)) throw new Error(text(fields, 9) || "当前片源没有网页可播放的地址");
  return { url, direct: num(fields, 5) === 1 };
}
