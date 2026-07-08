import { deflate as pakoDeflate } from 'pako';

const TOKEN_VERSION = '007';
const APP_ID_RE = /^[0-9a-f]{32}$/i;
const TOKEN_EXPIRE_SECONDS = 60 * 60;

const RTC_SERVICE_TYPE = 1;
const PRIVILEGE_JOIN_CHANNEL = 1;
const PRIVILEGE_PUBLISH_AUDIO = 2;
const PRIVILEGE_PUBLISH_VIDEO = 3;
const PRIVILEGE_PUBLISH_DATA = 4;

const textEncoder = new TextEncoder();

type CompressionStreamInstance = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type CompressionStreamConstructor = new (format: 'deflate') => CompressionStreamInstance;

type CompressionWindow = Window & {
  CompressionStream?: CompressionStreamConstructor;
};

class ByteWriter {
  private chunks: Uint8Array[] = [];

  putUint16(value: number): ByteWriter {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    this.chunks.push(bytes);
    return this;
  }

  putUint32(value: number): ByteWriter {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    this.chunks.push(bytes);
    return this;
  }

  putBytes(bytes: Uint8Array): ByteWriter {
    this.putUint16(bytes.length);
    this.chunks.push(bytes);
    return this;
  }

  putString(value: string | Uint8Array): ByteWriter {
    return this.putBytes(typeof value === 'string' ? textEncoder.encode(value) : value);
  }

  putPrivilegeMap(privileges: Record<number, number>): ByteWriter {
    const entries = Object.entries(privileges).sort(([a], [b]) => Number(a) - Number(b));
    this.putUint16(entries.length);
    entries.forEach(([privilege, expire]) => {
      this.putUint16(Number(privilege));
      this.putUint32(expire);
    });
    return this;
  }

  pack(): Uint8Array {
    return concatBytes(this.chunks);
  }
}

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
};

const hmacSha256 = async (key: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
  if (!crypto.subtle) {
    throw new Error('当前环境不支持本地生成声网 token。');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message));
};

const deflateWithCompressionStream = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const CompressionStream = (window as CompressionWindow).CompressionStream;
  if (!CompressionStream) {
    throw new Error('当前浏览器不支持本地生成声网 token。');
  }

  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
  }

  return concatBytes(chunks);
};

const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  try {
    return pakoDeflate(bytes);
  } catch {
    return deflateWithCompressionStream(bytes);
  }
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(binary);
};

const packRtcService = (channelName: string, uid: number, privilegeExpire: number): Uint8Array => {
  const privileges = {
    [PRIVILEGE_JOIN_CHANNEL]: privilegeExpire,
    [PRIVILEGE_PUBLISH_AUDIO]: privilegeExpire,
    [PRIVILEGE_PUBLISH_VIDEO]: privilegeExpire,
    [PRIVILEGE_PUBLISH_DATA]: privilegeExpire,
  };

  return concatBytes([
    new ByteWriter().putUint16(RTC_SERVICE_TYPE).putPrivilegeMap(privileges).pack(),
    new ByteWriter().putString(channelName).putString(uid === 0 ? '' : String(uid)).pack(),
  ]);
};

export const createAgoraUid = (userId: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
};

export const buildAgoraRtcToken = async (
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  tokenExpire = TOKEN_EXPIRE_SECONDS
): Promise<string> => {
  if (!APP_ID_RE.test(appId) || !APP_ID_RE.test(appCertificate)) {
    throw new Error('声网 App ID 或证书格式不正确。');
  }

  const issueTs = Math.floor(Date.now() / 1000);
  const salt = Math.floor(Math.random() * 99999999) + 1;
  const appCertificateBytes = textEncoder.encode(appCertificate);
  let signing = await hmacSha256(new ByteWriter().putUint32(issueTs).pack(), appCertificateBytes);
  signing = await hmacSha256(new ByteWriter().putUint32(salt).pack(), signing);

  const service = packRtcService(channelName, uid, tokenExpire);
  const signingInfo = concatBytes([
    new ByteWriter()
      .putString(appId)
      .putUint32(issueTs)
      .putUint32(tokenExpire)
      .putUint32(salt)
      .putUint16(1)
      .pack(),
    service,
  ]);
  const signature = await hmacSha256(signing, signingInfo);
  const content = concatBytes([new ByteWriter().putString(signature).pack(), signingInfo]);
  const compressed = await deflate(content);

  return `${TOKEN_VERSION}${bytesToBase64(compressed)}`;
};
