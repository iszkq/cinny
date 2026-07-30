import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Android media uses browser authentication before the native fallback', async () => {
  const source = await readSource('src/app/utils/matrix.ts');
  const fallbackStart = source.indexOf('const fetchMediaWithAndroidFallback');
  const fallbackEnd = source.indexOf('const withMediaAccessToken', fallbackStart);
  const fallbackBody = source.slice(fallbackStart, fallbackEnd);

  assert.ok(
    fallbackBody.indexOf('fetchWithTimeout') <
      fallbackBody.indexOf('fetchMediaWithAndroidNativeHttp')
  );
  assert.match(
    source,
    /mediaUrl\.origin === homeserverUrl\.origin && MATRIX_MEDIA_PATH_MATCHER\.test\(mediaUrl\.pathname\)/
  );
  assert.match(source, /authHeaders\.set\('Authorization', `Bearer \$\{session\.accessToken\}`\)/);
  assert.match(source, /const requestAttempts:/);
  assert.match(source, /withMediaAccessToken\(requestUrl, session\.accessToken\)/);
  assert.match(fallbackBody, /!nativeEligible \|\| isUsableMediaResponse\(browserResponse\)/);
  assert.match(source, /contentType\.includes\('application\/json'\)/);
});

test('Android persistent media cache rejects stale bad responses without rewriting cache hits', async () => {
  const source = await readSource('src/app/utils/mediaUrlCache.ts');
  const nativeSource = await readSource('src/app/utils/androidMediaAssetCache.ts');
  const javaSource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/AndroidMediaCachePlugin.java'
  );

  assert.match(source, /PERSISTENT_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v4'/);
  assert.match(source, /contentType\.includes\('text\/html'\)/);
  assert.match(source, /if \(!isAndroidApp\(\)\) \{\s+await touchPersistentMediaEntry/);
  assert.match(source, /legacyCacheCleanupComplete/);
  assert.match(source, /PERSISTENT_MEDIA_TRIM_INTERVAL = 64/);
  assert.match(source, /prepareAndroidMediaAssetUrl\(src\)/);
  assert.match(source, /legacyUrl\.searchParams\.delete\('animated'\)/);
  assert.match(nativeSource, /Capacitor\.convertFileSrc\(asset\.filePath\)/);
  assert.match(javaSource, /getContext\(\)\.getFilesDir\(\)/);
  assert.match(javaSource, /REQUEST_DEADLINE_MS = 15_000L/);
  assert.match(javaSource, /Executors\.newFixedThreadPool\(4\)/);
  assert.doesNotMatch(
    source,
    /await trimPersistentMediaCache\(mediaCache, Math\.max\(0, MAX_PERSISTENT_MEDIA_ENTRIES - 1\)\)/
  );
});

test('Android sticker grid limits memory blobs and defers offscreen media', async () => {
  const packSource = await readSource('src/app/hooks/useImagePacks.ts');
  const itemSource = await readSource('src/app/components/emoji-board/Item.tsx');

  assert.match(packSource, /ANDROID_IMAGE_PACK_PRIORITY_OBJECT_WARM_LIMIT = 36/);
  assert.match(packSource, /ANDROID_IMAGE_PACK_SECONDARY_OBJECT_WARM_LIMIT = 24/);
  assert.match(itemSource, /IntersectionObserver/);
  assert.match(itemSource, /nearViewport \? primaryUrl : undefined/);
  assert.match(itemSource, /preferOriginal: !androidApp/);
  assert.match(itemSource, /forceThumbnail: androidApp/);
  assert.match(itemSource, /entry\.isIntersecting/);
  assert.doesNotMatch(itemSource, /observer\.unobserve\(entry\.target\)/);
  assert.match(packSource, /deferFallbackPersistent: true/);
  const mediaSource = await readSource('src/app/components/emoji-board/media.ts');
  assert.match(mediaSource, /url\.searchParams\.set\('animated', 'false'\)/);
});

test('Android timeline and custom emoji never fall back to raw authenticated image URLs', async () => {
  const stableSource = await readSource('src/app/components/emoji-board/useStableMediaUrl.ts');
  const imageSource = await readSource('src/app/components/message/content/ImageContent.tsx');
  const reactionSource = await readSource('src/app/components/message/Reaction.tsx');
  const htmlSource = await readSource('src/app/plugins/react-custom-html-parser.tsx');

  assert.match(stableSource, /allowDirectSource: !requireObjectUrl/);
  assert.match(imageSource, /const preferAndroidThumbnail =/);
  assert.match(reactionSource, /displayUrl \|\| !androidApp/);
  assert.match(htmlSource, /if \(androidApp && !displayUrl\)/);
  assert.match(htmlSource, /fallbackLabel \? `:\$\{fallbackLabel\}:`/);
  assert.match(stableSource, /const timeoutId = requireObjectUrl\s+\? undefined/);
  assert.match(stableSource, /invalidateCachedMediaUrl\(src\)/);
  assert.match(stableSource, /primeCachedMediaObjectUrl\(fallbackSrc, 'visible', true\)/);
});

test('Android cloud emoji uses its visible source preview without serializing it into messages', async () => {
  const roomInputSource = await readSource('src/app/features/room/RoomInput.tsx');
  const editorSource = await readSource('src/app/components/editor/Elements.tsx');
  const outputSource = await readSource('src/app/components/editor/output.ts');

  assert.match(roomInputSource, /handleEmoticonSelect\(key, shortcode, sourceUrl\)/);
  assert.match(editorSource, /const androidPreviewUrl =/);
  assert.doesNotMatch(editorSource, /\{'\.\.\.'\}/);
  assert.doesNotMatch(outputSource, /previewUrl/);
});

test('Android emoji board and software keyboard are mutually exclusive', async () => {
  const roomInputSource = await readSource('src/app/features/room/RoomInput.tsx');
  const editorSource = await readSource('src/app/components/editor/Editor.tsx');

  assert.match(
    roomInputSource,
    /if \(mobileEmojiBoard && editorFocused\) \{\s+ReactEditor\.blur\(editor\)/
  );
  assert.match(
    roomInputSource,
    /onPointerDown=\{\(evt\) => \{\s+if \(mobileEmojiBoard && emojiBoardOpenRef\.current\) \{\s+evt\.preventDefault\(\)/
  );
  assert.match(editorSource, /onPointerDown=\{onPointerDown\}/);
  assert.match(roomInputSource, /closeEmojiBoard\(\);\s+ReactEditor\.focus\(editor\);/);
});

test('Only Android portrait timeline images use the compact width', async () => {
  const source = await readSource('src/app/components/message/MsgTypeRenderers.tsx');

  assert.match(source, /ANDROID_PORTRAIT_IMAGE_TIMELINE_WIDTH = 144/);
  assert.match(source, /isAndroidApp\(\) && hasAspectRatio/);
  assert.match(
    source,
    /androidPortrait \? ANDROID_PORTRAIT_IMAGE_TIMELINE_WIDTH : IMAGE_TIMELINE_WIDTH/
  );
});

test('media cache survives ordinary app upgrades and resource recovery', async () => {
  const cacheSource = await readSource('src/app/utils/mediaUrlCache.ts');
  const startupSource = await readSource('src/index.tsx');

  assert.match(cacheSource, /PERSISTENT_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v4'/);
  assert.match(
    startupSource,
    /cacheKeys\.filter\(\(key\) => key\.startsWith\('workbox-precache'\)\)/
  );
  assert.doesNotMatch(startupSource, /cacheKeys\.map\(\(key\) => window\.caches\.delete/);
  const javaSource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/AndroidMediaCachePlugin.java'
  );
  assert.match(javaSource, /android-media-cache-v1/);
  assert.doesNotMatch(javaSource, /getCacheDir\(\)/);
});

test('Android images, avatars, emoji and encrypted media share the native file cache', async () => {
  const cacheSource = await readSource('src/app/utils/mediaUrlCache.ts');
  const encryptedSource = await readSource('src/app/utils/encryptedMediaCache.ts');
  const uploadSource = await readSource('src/app/features/room/msgContent.ts');
  const activitySource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/MainActivity.java'
  );

  assert.match(cacheSource, /setObjectUrlMediaEntry\(src, assetUrl, 0\)/);
  assert.match(encryptedSource, /prepareAndroidMediaAssetUrl\(sourceUrl, mimeType\)/);
  assert.match(encryptedSource, /getPersistedMediaBlob\(sourceUrl\)/);
  assert.match(uploadSource, /await cacheUploadedMxcMedia\(mx, mxc, file\)/);
  assert.match(uploadSource, /await cacheUploadedMxcMedia\(mx, thumbMxc, thumbnailFile\)/);
  assert.match(activitySource, /registerPlugin\(AndroidMediaCachePlugin\.class\)/);
});

test('web service worker and stylesheet recovery never refresh a healthy active page', async () => {
  const startupSource = await readSource('src/index.tsx');
  const workerSource = await readSource('src/sw.ts');

  assert.doesNotMatch(startupSource, /controllerchange[\s\S]{0,180}window\.location\.reload/);
  assert.doesNotMatch(workerSource, /client\.navigate\(/);
  assert.match(startupSource, /data-cinny-stylesheet-failed/);
  assert.doesNotMatch(startupSource, /if \(link\.sheet === null\) retryFailedStylesheet/);
});

test('Android avatar cache survives component remounts without a fallback flash', async () => {
  const avatarSource = await readSource('src/app/hooks/useResilientAvatarMedia.ts');
  const warmSource = await readSource('src/app/pages/client/ClientNonUIFeatures.tsx');

  assert.match(avatarSource, /const androidLoadedAvatarBySource = new Map/);
  assert.match(avatarSource, /rememberedAndroidUrl/);
  assert.match(
    avatarSource,
    /displaySrcLoaded: Boolean\(displaySrc && loadedAvatarMedia\.has\(displaySrc\)\)/
  );
  assert.match(warmSource, /primePersistentMediaUrl\(avatarUrl, 'background'\)/);
  assert.match(warmSource, /ANDROID_AVATAR_OBJECT_WARM_LIMIT = 64/);
});

test('Android image preview exposes every action without horizontal scrolling', async () => {
  const viewerSource = await readSource('src/app/components/image-viewer/ImageViewer.tsx');
  const viewerStyles = await readSource('src/app/components/image-viewer/ImageViewer.css.ts');

  assert.match(viewerSource, /androidApp && css\.ImageViewerAndroidToolbar/);
  assert.match(viewerSource, /onClick=\{rotateRight\}/);
  assert.match(viewerSource, /onClick=\{handleRecognizeText\}/);
  assert.match(viewerSource, /onClick=\{handleDownload\}/);
  assert.match(viewerStyles, /gridTemplateColumns: 'repeat\(7, minmax\(0, 1fr\)\)'/);
  assert.match(viewerStyles, /overflow: 'visible'/);
});

test('Android-only optimizations stay behind platform guards', async () => {
  const itemSource = await readSource('src/app/components/emoji-board/Item.tsx');
  const imageSource = await readSource('src/app/components/message/content/ImageContent.tsx');
  const reactionSource = await readSource('src/app/components/message/Reaction.tsx');

  assert.match(itemSource, /preferOriginal: !androidApp/);
  assert.match(imageSource, /androidApp && !preferOriginalPreview/);
  assert.match(
    reactionSource,
    /androidApp \? thumbnailMediaUrl \?\? originalMediaUrl : originalMediaUrl/
  );
});
