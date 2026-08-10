import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Matrix media requests are single-flight with bounded recoverable failures', async () => {
  const source = await readSource('src/app/utils/matrix.ts');

  assert.match(source, /const pendingMediaFetches = new Map<string, Promise<Response>>\(\)/);
  assert.match(source, /const failedMediaFetches = new Map<string, MediaFetchFailure>\(\)/);
  assert.match(source, /if \(pendingFetch\) \{\s*return \(await pendingFetch\)\.clone\(\)/);
  assert.match(source, /getPublicMediaFallbackUrls\(strippedSrc, baseUrl\)/);
  assert.match(source, /\.slice\(0, 3\)/);
  assert.doesNotMatch(source, /getPublicMediaFallbackUrls\(src, baseUrl\)/);
  assert.match(
    source,
    /AUTH_MEDIA_PATHS\.some[\s\S]*authenticatedMediaRequest[\s\S]*headers: authHeaders[\s\S]*: \[\{ url: requestUrl, headers: baseHeaders \}\]/
  );
  assert.match(source, /MEDIA_FETCH_FAILURE_BASE_RETRY_MS = 3_000/);
  assert.match(source, /MEDIA_FETCH_MAX_RETRY_MS = 60_000/);
  assert.match(source, /baseDelay \* 2 \*\* Math\.min\(attempts - 1, 4\)/);
  assert.match(source, /init\?\.signal/);
  assert.match(source, /if \(!isAbortError\(error\)\)/);
  assert.match(source, /failedMediaFetches\.delete\(fetchKey\)/);
  assert.match(
    source,
    /window\.addEventListener\('online', \(\) => failedMediaFetches\.clear\(\)\)/
  );
  assert.match(source, /currentMediaFetchSessionSignature !== sessionSignature/);
});

test('service worker shares the same bounded candidate and cooldown policy', async () => {
  const source = await readSource('src/sw.ts');

  assert.match(source, /const pendingMediaFetches = new Map<string, Promise<Response>>\(\)/);
  assert.match(source, /const requestUrls = getMediaRequestUrls\(request\.url\)/);
  assert.doesNotMatch(source, /request\.headers\.has\('Authorization'\)/);
  assert.match(source, /'\/_matrix\/media\/v3\/download'/);
  assert.match(source, /'\/_matrix\/media\/r0\/download'/);
  assert.match(source, /\.slice\(0, 3\)/);
  assert.match(
    source,
    /isAuthenticatedClientMediaRequest[\s\S]*\/_matrix\\\/client\\\/\[\^\/\]\+\\\/media/
  );
  assert.match(source, /requestHeaders\.delete\('Authorization'\)/);
  assert.match(source, /if \(pendingFetch\) \{\s*return \(await pendingFetch\)\.clone\(\)/);
  assert.match(source, /if \(!isAbortError\(error\)\)/);
  assert.match(
    source,
    /previousSession\?\.accessToken !== nextSession\?\.accessToken[\s\S]*failedMediaFetches\.clear\(\)/
  );
  assert.match(source, /mediaFetchSessionGeneration \+= 1/);
});

test('service worker tries v3 and r0 after a client media 404 before cooling the resource', async () => {
  const source = await readSource('src/sw.ts');
  const performStart = source.indexOf('async function performMediaFetchWithFallback');
  const performEnd = source.indexOf('function getCanonicalMediaFetchUrl', performStart);
  const performSource = source.slice(performStart, performEnd);

  assert.match(
    source,
    /'\/_matrix\/client\/v1\/media\/download': \['\/_matrix\/media\/v3\/download', '\/_matrix\/media\/r0\/download'\]/
  );
  assert.match(performSource, /const requestUrls = getMediaRequestUrls\(request\.url\)/);
  assert.match(performSource, /for \(const requestUrl of requestUrls\)/);
  assert.match(performSource, /if \(response\.ok\)[\s\S]*return safeResponse/);
  assert.doesNotMatch(performSource, /rememberMediaFetchFailure/);
  assert.match(
    source,
    /performMediaFetchWithFallback\(request, session\)[\s\S]*rememberMediaFetchFailure\(fetchKey, response\.status\)/
  );
});

test('mounted media retries are delayed and bounded without invalidating cooldowns', async () => {
  const hookSource = await readSource('src/app/hooks/useCachedMediaUrl.ts');
  const cacheSource = await readSource('src/app/utils/mediaUrlCache.ts');

  assert.match(hookSource, /MEDIA_OBJECT_URL_RETRY_DELAYS_MS = \[3_000, 8_000, 20_000\]/);
  assert.match(hookSource, /const retryDelay = MEDIA_OBJECT_URL_RETRY_DELAYS_MS\[retryIndex\]/);
  assert.match(hookSource, /window\.addEventListener\('online', handleOnline\)/);
  assert.doesNotMatch(hookSource, /invalidateCachedMediaUrl/);
  assert.match(cacheSource, /FAILED_MEDIA_RETRY_DELAY_MS = 3_000/);
  assert.match(cacheSource, /FAILED_MEDIA_NOT_FOUND_RETRY_DELAY_MS = 5_000/);
  assert.match(cacheSource, /FAILED_MEDIA_MAX_RETRY_DELAY_MS = 60_000/);
  assert.match(cacheSource, /window\.addEventListener\('online', clearFailedMediaEntries\)/);
});
