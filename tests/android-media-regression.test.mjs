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

test('Android persistent media validates native files and preserves older cache generations', async () => {
  const source = await readSource('src/app/utils/mediaUrlCache.ts');
  const nativeSource = await readSource('src/app/utils/androidMediaAssetCache.ts');
  const javaSource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/AndroidMediaCachePlugin.java'
  );

  assert.match(source, /PERSISTENT_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v4'/);
  assert.match(source, /contentType\.includes\('text\/html'\)/);
  assert.match(source, /if \(!isAndroidApp\(\)\) \{\s+await touchPersistentMediaEntry/);
  assert.match(source, /getLegacyMediaCaches/);
  assert.match(source, /matchedCache !== mediaCache/);
  assert.doesNotMatch(source, /LEGACY_PERSISTENT_MEDIA_CACHES[\s\S]{0,500}caches\.delete/);
  assert.match(source, /PERSISTENT_MEDIA_TRIM_INTERVAL = 64/);
  assert.match(source, /loadAndroidMediaBlob\(src, \(lateMediaBlob\)/);
  assert.match(source, /fetch\(assetUrl, \{ cache: 'no-store' \}\)/);
  assert.match(source, /responseToMediaBlob/);
  assert.match(source, /fetchAndPersistMedia\(src\)/);
  assert.match(source, /loadAndroidNativeMediaBlob\(src, true\)/);
  assert.match(nativeSource, /cacheOnly\?: boolean/);
  assert.match(javaSource, /boolean cacheOnly =/);
  assert.match(javaSource, /if \(cacheOnly\) \{/);
  assert.match(source, /ANDROID_MEDIA_RESOLVE_DEADLINE_MS = 20_000/);
  assert.match(source, /onLateMedia\(blob\)/);
  assert.match(source, /cacheRuntimeMediaBlob\(src, lateMediaBlob\)/);
  assert.match(source, /maxEntries: 10_000/);
  assert.match(source, /typeof window === 'undefined' \|\| isAndroidApp\(\)/);
  assert.match(source, /legacyUrl\.searchParams\.delete\('animated'\)/);
  assert.match(nativeSource, /toAndroidWebViewAssetUrl\(asset\.filePath\)/);
  assert.match(javaSource, /getContext\(\)\.getFilesDir\(\)/);
  assert.match(javaSource, /Uri\.fromFile\(file\)\.toString\(\)/);
  assert.match(javaSource, /if \(isInvalidMediaType\(mimeType\)\) return true/);
  assert.match(javaSource, /MAX_CACHE_FILES = 10_000/);
  assert.match(javaSource, /!looksLikeHtmlOrJson\(cachedFile, cachedMimeType\)/);
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
  const boardSource = await readSource('src/app/components/emoji-board/EmojiBoard.tsx');

  assert.match(packSource, /ANDROID_IMAGE_PACK_PRIORITY_OBJECT_WARM_LIMIT = 36/);
  assert.match(packSource, /ANDROID_IMAGE_PACK_SECONDARY_OBJECT_WARM_LIMIT = 24/);
  assert.match(itemSource, /IntersectionObserver/);
  assert.match(itemSource, /nearViewport \? primaryUrl : undefined/);
  assert.match(itemSource, /preferOriginal: !androidApp/);
  assert.match(itemSource, /forceThumbnail: androidApp/);
  assert.match(itemSource, /entry\.isIntersecting/);
  assert.match(itemSource, /if \(visible\) setNearViewport\(true\)/);
  assert.doesNotMatch(itemSource, /observer\.unobserve\(entry\.target\)/);
  assert.match(packSource, /deferFallbackPersistent: true/);
  assert.match(boardSource, /primePersistentMediaUrl\(mediaUrl, 'background'\)/);
  assert.match(boardSource, /getPackMediaUrls\(pack, true\)/);
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
  assert.match(imageSource, /autoRetry: androidApp/);
  assert.match(reactionSource, /displayUrl \|\| !androidApp/);
  assert.match(reactionSource, /const primaryMediaUrl = originalMediaUrl \?\? thumbnailMediaUrl/);
  assert.match(htmlSource, /if \(androidApp && !displayUrl\)/);
  assert.match(htmlSource, /const primarySrc = originalSrc/);
  assert.match(htmlSource, /\{'\\u25cc'\}/);
  assert.doesNotMatch(htmlSource, /fallbackLabel \? `:\$\{fallbackLabel\}:`/);
  assert.match(stableSource, /const timeoutId = requireObjectUrl\s+\? undefined/);
  assert.match(stableSource, /invalidateCachedMediaUrl\(src\)/);
  assert.match(stableSource, /primeCachedMediaObjectUrl\(fallbackSrc, 'visible', true\)/);
  assert.match(stableSource, /window\.addEventListener\('online', handleOnline\)/);
  assert.match(stableSource, /const retryDelays = \[1_500, 5_000, 15_000\]/);
  assert.match(reactionSource, /autoRetry: androidApp/);
  assert.match(htmlSource, /autoRetry: androidApp/);
});

test('Android cloud emoji uses its visible source preview without serializing it into messages', async () => {
  const roomInputSource = await readSource('src/app/features/room/RoomInput.tsx');
  const editorSource = await readSource('src/app/components/editor/Elements.tsx');
  const outputSource = await readSource('src/app/components/editor/output.ts');
  const remoteIndexSource = await readSource(
    'src/app/components/emoji-board/useRemoteStickerIndex.ts'
  );

  assert.match(roomInputSource, /handleEmoticonSelect\(key, shortcode, sourceUrl\)/);
  assert.match(roomInputSource, /detectRemoteImageMimeType/);
  assert.match(roomInputSource, /ascii\.startsWith\('GIF87a'\)/);
  assert.match(roomInputSource, /ascii\.slice\(8, 12\) === 'WEBP'/);
  assert.match(roomInputSource, /new Blob\(\[blob\], \{ type: mimeType \}\)/);
  assert.match(roomInputSource, /await cacheUploadedMxcMedia\(mx, mxc, sourceFile\)/);
  assert.match(
    remoteIndexSource,
    /\[item\.httpUrl, item\.sourceUrl, item\.url, item\.previewUrl, item\.thumbUrl, item\.thumbnailUrl\]/
  );
  assert.match(remoteIndexSource, /headers\.set\('If-None-Match', etag\)/);
  assert.match(remoteIndexSource, /response\.status === 304/);
  assert.match(remoteIndexSource, /fetchMediaWithAuth\(REMOTE_STICKER_INDEX_URL/);
  assert.match(remoteIndexSource, /fetchRemoteStickerIndex\(cachedRemoteStickerEtag\)/);
  assert.match(remoteIndexSource, /response\.notModified && cachedRemoteStickerIndex/);
  assert.match(remoteIndexSource, /const staleStickers = loadCachedRemoteStickers\(\)/);
  assert.match(remoteIndexSource, /refreshRemoteStickers\(\)/);
  assert.doesNotMatch(remoteIndexSource, /REMOTE_STICKER_INDEX_CACHE_TTL_MS/);
  assert.match(editorSource, /const androidPreviewUrl =/);
  assert.doesNotMatch(editorSource, /\{'\.\.\.'\}/);
  assert.doesNotMatch(
    editorSource,
    /<span aria-label=\{element\.shortcode\}>:\{element\.shortcode\}:<\/span>/
  );
  assert.doesNotMatch(outputSource, /previewUrl/);
});

test('Video messages infer safe inline playback types from filenames', async () => {
  const rendererSource = await readSource('src/app/components/message/MsgTypeRenderers.tsx');
  const mimeSource = await readSource('src/app/utils/mimeTypes.ts');
  const videoContentSource = await readSource(
    'src/app/components/message/content/VideoContent.tsx'
  );

  assert.match(rendererSource, /content\?\.info \?\? \{\}/);
  assert.match(rendererSource, /getVideoMimeType\(videoInfo\?\.mimetype \?\? '', filename\)/);
  assert.match(mimeSource, /mp4: 'video\/mp4'/);
  assert.match(mimeSource, /webm: 'video\/webm'/);
  assert.match(mimeSource, /VIDEO_EXTENSION_MIME_TYPE\[getFileNameExt\(fileName\)\]/);
  assert.match(videoContentSource, /new Blob\(\[fileContent\], \{ type: mimeType \}\)/);
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
  assert.match(roomInputSource, /flushSync\(\(\) => closeEmojiBoard\(\)\)/);
  assert.match(roomInputSource, /Transforms\.select\(editor, Editor\.end\(editor, \[\]\)\)/);
  assert.match(roomInputSource, /ReactEditor\.focus\(editor\)/);
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

  assert.match(cacheSource, /loadAndroidNativeMediaBlob/);
  assert.match(cacheSource, /URL\.createObjectURL\(mediaBlob\)/);
  assert.match(encryptedSource, /prepareAndroidMediaAssetUrl\(sourceUrl, mimeType\)/);
  assert.match(encryptedSource, /getPersistedMediaBlob\(sourceUrl\)/);
  assert.match(uploadSource, /await cacheUploadedMxcMedia\(mx, mxc, file\)/);
  assert.match(uploadSource, /await cacheUploadedMxcMedia\(mx, thumbMxc, thumbnailFile\)/);
  assert.match(uploadSource, /export const cacheUploadedMxcMedia/);
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
  assert.match(avatarSource, /isCachedMediaObjectUrl\(rememberedAvatarUrl\)/);
  assert.match(avatarSource, /window\.addEventListener\('online', handleOnline\)/);
  assert.match(avatarSource, /preferOriginal && !androidApp \? getOriginalMediaUrl\(src\) : src/);
  assert.doesNotMatch(avatarSource, /\[rememberedAndroidUrl, desktopUrl, objectUrl/);
  assert.match(
    avatarSource,
    /displaySrcLoaded: Boolean\(displaySrc && loadedAvatarMedia\.has\(displaySrc\)\)/
  );
  assert.match(warmSource, /primePersistentMediaUrl\(avatarUrl, 'background'\)/);
  assert.match(warmSource, /ANDROID_AVATAR_OBJECT_WARM_LIMIT = 64/);
});

test('Android image preview exposes every action without horizontal scrolling', async () => {
  const viewerSource = await readSource('src/app/components/image-viewer/ImageViewer.tsx');
  const globalViewerSource = await readSource(
    'src/app/components/image-viewer/GlobalImageViewer.tsx'
  );
  const viewerStyles = await readSource('src/app/components/image-viewer/ImageViewer.css.ts');

  assert.match(viewerSource, /androidApp && css\.ImageViewerAndroidToolbar/);
  assert.match(viewerSource, /onClick=\{rotateRight\}/);
  assert.match(viewerSource, /onClick=\{handleRecognizeText\}/);
  assert.match(viewerSource, /onClick=\{handleDownload\}/);
  assert.match(viewerStyles, /gridTemplateColumns: 'repeat\(7, minmax\(0, 1fr\)\)'/);
  assert.match(viewerStyles, /overflow: 'visible'/);
  assert.match(globalViewerSource, /ANDROID_ORIGINAL_RESOLVE_MAX_MS = 20_000/);
  assert.match(globalViewerSource, /Promise\.race/);
  assert.match(globalViewerSource, /setSourceCache\(\{\}\)/);
  assert.match(globalViewerSource, /ANDROID_ORIGINAL_LATE_RETRY_MS = 1_500/);
  assert.match(globalViewerSource, /window\.addEventListener\('online', handleOnline\)/);
});

test('Android-only optimizations stay behind platform guards', async () => {
  const itemSource = await readSource('src/app/components/emoji-board/Item.tsx');
  const imageSource = await readSource('src/app/components/message/content/ImageContent.tsx');
  const reactionSource = await readSource('src/app/components/message/Reaction.tsx');

  assert.match(itemSource, /preferOriginal: !androidApp/);
  assert.match(imageSource, /androidApp && !preferOriginalPreview/);
  assert.match(reactionSource, /originalMediaUrl \?\? thumbnailMediaUrl/);
});

test('Android room search is scrollable and cancels local history pagination on close', async () => {
  const dialogSource = await readSource(
    'src/app/features/message-search/RoomMessageSearchDialog.tsx'
  );
  const searchSource = await readSource('src/app/features/message-search/useMessageSearch.ts');

  assert.match(dialogSource, /queryFn: \(\{ pageParam, signal \}\)/);
  assert.match(dialogSource, /queryClient\s*\.cancelQueries/);
  assert.match(dialogSource, /height: androidApp && compact \? 'min\(42dvh, 28rem\)'/);
  assert.match(searchSource, /throwIfSearchAborted\(signal\)/);
  assert.match(searchSource, /paginateLocalRoomHistoryStep\(mx, room, roomState, signal\)/);
});
