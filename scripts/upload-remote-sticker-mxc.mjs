#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const MIME_BY_EXT = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

const isMxcUrl = (value) => typeof value === 'string' && value.startsWith('mxc://');
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

const getEnv = (name) => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const homeserver = getEnv('MATRIX_HOMESERVER') ?? getEnv('MATRIX_BASE_URL');
const accessToken = getEnv('MATRIX_ACCESS_TOKEN');
const input = process.argv[2] ?? getEnv('STICKER_INDEX_IN') ?? 'index.json';
const output = process.argv[3] ?? getEnv('STICKER_INDEX_OUT') ?? 'index.mxc.json';
const localRoot = getEnv('STICKER_LOCAL_ROOT');
const concurrency = Math.max(1, Number.parseInt(getEnv('STICKER_UPLOAD_CONCURRENCY') ?? '3', 10));

if (!homeserver || !accessToken) {
  console.error(
    'Missing MATRIX_HOMESERVER/MATRIX_BASE_URL or MATRIX_ACCESS_TOKEN. These are required to create mxc URLs.'
  );
  process.exit(1);
}

const guessMimeType = (fileName) =>
  MIME_BY_EXT[extname(fileName ?? '').toLowerCase()] ?? 'application/octet-stream';

const loadJson = async (source) => {
  if (isHttpUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch index ${source}: ${response.status}`);
    }
    return response.json();
  }

  return JSON.parse(await readFile(source, 'utf8'));
};

const getLocalFilePath = (item) => {
  if (!localRoot) return undefined;

  const relativePath =
    typeof item.path === 'string'
      ? item.path
      : typeof item.folder === 'string' && typeof item.fileName === 'string'
      ? join(item.folder, item.fileName)
      : undefined;
  if (!relativePath) return undefined;

  const root = resolve(localRoot);
  const filePath = resolve(root, relativePath);
  if (filePath !== root && filePath.startsWith(`${root}${sep}`)) {
    return filePath;
  }
  return undefined;
};

const getSource = async (item) => {
  const localFilePath = getLocalFilePath(item);
  if (localFilePath) {
    const data = await readFile(localFilePath);
    return {
      data,
      mimeType: item.mimeType ?? guessMimeType(localFilePath),
    };
  }

  const sourceUrl = [item.url, item.httpUrl, item.sourceUrl, item.previewUrl].find(isHttpUrl);
  if (!sourceUrl) {
    throw new Error('Item has no HTTP source URL');
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl}: ${response.status}`);
  }

  return {
    data: Buffer.from(await response.arrayBuffer()),
    mimeType:
      response.headers.get('content-type')?.split(';')[0].trim() ??
      item.mimeType ??
      guessMimeType(item.fileName),
  };
};

const uploadToMatrix = async (item) => {
  const fileName = item.fileName ?? `${item.name ?? item.id ?? 'sticker'}.gif`;
  const { data, mimeType } = await getSource(item);
  const uploadUrl = new URL('/_matrix/media/v3/upload', homeserver);
  uploadUrl.searchParams.set('filename', fileName);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    body: data,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Matrix upload failed for ${fileName}: ${response.status} ${body}`);
  }

  const result = await response.json();
  if (!isMxcUrl(result.content_uri)) {
    throw new Error(`Matrix upload did not return content_uri for ${fileName}`);
  }

  item.mxc = result.content_uri;
  item.mimeType ??= mimeType;
  item.size ??= data.length;
};

const run = async () => {
  const index = await loadJson(input);
  const items = Array.isArray(index.items) ? index.items : [];
  let nextIndex = 0;
  let skipped = 0;
  let uploaded = 0;
  let failed = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const itemIndex = nextIndex;
      nextIndex += 1;
      const item = items[itemIndex];

      if ([item.mxc, item.mxcUrl, item.matrixUrl, item.url].some(isMxcUrl)) {
        skipped += 1;
        continue;
      }

      try {
        await uploadToMatrix(item);
        uploaded += 1;
        console.log(
          `[${uploaded + skipped + failed}/${items.length}] uploaded ${item.name ?? item.id}`
        );
      } catch (error) {
        failed += 1;
        console.error(
          `[${uploaded + skipped + failed}/${items.length}] failed ${item.name ?? item.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  const nextIndexJson = {
    ...index,
    generatedAt: new Date().toISOString(),
    items,
  };
  await writeFile(output, `${JSON.stringify(nextIndexJson, null, 2)}\n`, 'utf8');

  console.log(`Done. Uploaded: ${uploaded}, skipped: ${skipped}, failed: ${failed}.`);
  console.log(`Wrote ${output}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
