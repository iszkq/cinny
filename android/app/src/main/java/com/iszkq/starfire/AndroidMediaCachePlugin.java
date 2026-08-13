package com.iszkq.starfire;

import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AndroidMediaCache")
public class AndroidMediaCachePlugin extends Plugin {
    private static final String CACHE_ROOT = "android-media-cache-v1";
    private static final long REQUEST_DEADLINE_MS = 15_000L;
    private static final int CONNECT_TIMEOUT_MS = 5_000;
    private static final int READ_TIMEOUT_MS = 10_000;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_CACHE_FILES = 10_000;
    private static final long MAX_CACHE_BYTES = 2L * 1024L * 1024L * 1024L;
    private static final AtomicInteger WRITE_COUNT = new AtomicInteger();
    private static final ExecutorService MEDIA_EXECUTOR = Executors.newFixedThreadPool(4);

    private static final String CLIENT_DOWNLOAD = "/_matrix/client/v1/media/download";
    private static final String CLIENT_THUMBNAIL = "/_matrix/client/v1/media/thumbnail";

    private static class DownloadResult {
        final File file;
        final String mimeType;

        DownloadResult(File file, String mimeType) {
            this.file = file;
            this.mimeType = mimeType;
        }
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        MEDIA_EXECUTOR.execute(() -> prepareOnWorker(call));
    }

    private void prepareOnWorker(PluginCall call) {
        String sourceUrl = call.getString("sourceUrl");
        String accountKey = call.getString("accountKey");
        String baseUrl = call.getString("baseUrl");
        String accessToken = call.getString("accessToken");
        String requestedMimeType = call.getString("mimeType");
        boolean forceRefresh = Boolean.TRUE.equals(call.getBoolean("forceRefresh", false));
        boolean cacheOnly = Boolean.TRUE.equals(call.getBoolean("cacheOnly", false));

        if (sourceUrl == null || sourceUrl.trim().isEmpty()) {
            call.reject("sourceUrl is required");
            return;
        }
        if (accountKey == null || accountKey.trim().isEmpty()) {
            call.reject("accountKey is required");
            return;
        }

        try {
            File accountDir = new File(
                new File(getContext().getFilesDir(), CACHE_ROOT),
                sha256(accountKey.trim().toLowerCase(Locale.ROOT))
            );
            File assetDir = new File(accountDir, sha256(normalizeSourceUrl(sourceUrl)));

            if (forceRefresh) deleteRecursively(assetDir);
            File cachedFile = findCachedFile(assetDir);
            String cachedMimeType = cachedFile != null
                ? mimeTypeFromExtension(cachedFile.getName())
                : null;
            if (
                cachedFile != null &&
                cachedFile.length() > 0 &&
                !looksLikeHtmlOrJson(cachedFile, cachedMimeType)
            ) {
                cachedFile.setLastModified(System.currentTimeMillis());
                assetDir.setLastModified(System.currentTimeMillis());
                resolveFile(call, cachedFile, cachedMimeType);
                return;
            }
            if (cachedFile != null) deleteCachedFiles(assetDir);

            if (cacheOnly) {
                call.resolve(new JSObject());
                return;
            }

            if (!assetDir.exists() && !assetDir.mkdirs()) {
                throw new IllegalStateException("Unable to create Android media cache directory.");
            }

            DownloadResult downloaded = downloadMedia(
                sourceUrl,
                baseUrl,
                accessToken,
                requestedMimeType,
                assetDir
            );
            downloaded.file.setLastModified(System.currentTimeMillis());
            assetDir.setLastModified(System.currentTimeMillis());
            if (WRITE_COUNT.incrementAndGet() % 32 == 0) pruneAccountCache(accountDir);
            resolveFile(call, downloaded.file, downloaded.mimeType);
        } catch (Exception error) {
            call.reject("Failed to prepare Android media.", error);
        }
    }

    private void resolveFile(PluginCall call, File file, String mimeType) {
        JSObject result = new JSObject();
        // Capacitor's convertFileSrc accepts file:// URIs on every supported Android WebView.
        // Returning a URI also avoids a raw /data/... path being interpreted as an app-relative
        // URL when the native bridge is not ready at the exact moment the promise resolves.
        result.put("filePath", Uri.fromFile(file).toString());
        result.put("mimeType", mimeType);
        result.put("size", file.length());
        call.resolve(result);
    }

    private DownloadResult downloadMedia(
        String sourceUrl,
        String baseUrl,
        String accessToken,
        String requestedMimeType,
        File assetDir
    ) throws Exception {
        long deadline = System.currentTimeMillis() + REQUEST_DEADLINE_MS;
        List<String> requestUrls = buildRequestUrls(sourceUrl);
        Exception lastError = null;

        for (String requestUrl : requestUrls) {
            boolean matrixRequest = isSessionMediaUrl(requestUrl, baseUrl);
            List<String> attemptUrls = new ArrayList<>();
            attemptUrls.add(requestUrl);
            if (matrixRequest && accessToken != null && !accessToken.isEmpty()) {
                attemptUrls.add(withAccessToken(requestUrl, accessToken));
            }

            for (int index = 0; index < attemptUrls.size(); index += 1) {
                if (System.currentTimeMillis() >= deadline) {
                    throw new IllegalStateException("Android media request timed out.", lastError);
                }

                String attemptUrl = attemptUrls.get(index);
                String bearerToken = matrixRequest && index == 0 ? accessToken : null;
                try {
                    DownloadResult result = downloadAttempt(
                        attemptUrl,
                        bearerToken,
                        requestedMimeType,
                        assetDir,
                        deadline
                    );
                    if (result != null) return result;
                } catch (Exception error) {
                    lastError = error;
                }
            }
        }

        throw new IllegalStateException("Android media download failed.", lastError);
    }

    private DownloadResult downloadAttempt(
        String requestUrl,
        String bearerToken,
        String requestedMimeType,
        File assetDir,
        long deadline
    ) throws Exception {
        String currentUrl = requestUrl;
        String currentBearer = bearerToken;

        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
            int remaining = (int) Math.max(1_000L, deadline - System.currentTimeMillis());
            HttpURLConnection connection = (HttpURLConnection) new URL(currentUrl).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(Math.min(CONNECT_TIMEOUT_MS, remaining));
            connection.setReadTimeout(Math.min(READ_TIMEOUT_MS, remaining));
            connection.setRequestProperty("Accept", "image/*, application/octet-stream;q=0.9, */*;q=0.5");
            if (currentBearer != null && !currentBearer.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + currentBearer);
            }

            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) return null;
                URL previous = new URL(currentUrl);
                URL redirected = new URL(previous, location);
                if (!sameOrigin(previous, redirected)) currentBearer = null;
                currentUrl = redirected.toString();
                continue;
            }

            if (status < 200 || status >= 300) {
                connection.disconnect();
                return null;
            }

            String responseMimeType = normalizeMimeType(connection.getContentType());
            if (isInvalidMediaType(responseMimeType)) {
                connection.disconnect();
                return null;
            }

            String resolvedMimeType = responseMimeType != null
                ? responseMimeType
                : normalizeMimeType(requestedMimeType);
            String extension = extensionForMimeType(resolvedMimeType);
            File tempFile = new File(assetDir, "media." + extension + ".download");
            File finalFile = new File(assetDir, "media." + extension);

            try (
                InputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(tempFile, false)
            ) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (System.currentTimeMillis() >= deadline) {
                        throw new IllegalStateException("Android media request timed out.");
                    }
                    output.write(buffer, 0, read);
                }
                output.flush();
            } finally {
                connection.disconnect();
            }

            if (tempFile.length() <= 0 || looksLikeHtmlOrJson(tempFile, resolvedMimeType)) {
                tempFile.delete();
                return null;
            }
            deleteCachedFiles(assetDir);
            if (!tempFile.renameTo(finalFile)) {
                copyFile(tempFile, finalFile);
                tempFile.delete();
            }
            return new DownloadResult(finalFile, resolvedMimeType);
        }

        return null;
    }

    private static List<String> buildRequestUrls(String sourceUrl) {
        Set<String> urls = new LinkedHashSet<>();
        urls.add(sourceUrl);
        urls.add(removeQueryParameter(sourceUrl, "allow_redirect"));
        addFallbackUrls(urls, sourceUrl);
        addFallbackUrls(urls, removeQueryParameter(sourceUrl, "allow_redirect"));
        urls.remove("");
        return new ArrayList<>(urls);
    }

    private static void addFallbackUrls(Set<String> urls, String sourceUrl) {
        Uri uri = Uri.parse(sourceUrl);
        String path = uri.getPath();
        if (path == null) return;
        if (path.startsWith(CLIENT_DOWNLOAD)) {
            urls.add(replacePathPrefix(uri, CLIENT_DOWNLOAD, "/_matrix/media/v3/download"));
            urls.add(replacePathPrefix(uri, CLIENT_DOWNLOAD, "/_matrix/media/r0/download"));
        } else if (path.startsWith(CLIENT_THUMBNAIL)) {
            urls.add(replacePathPrefix(uri, CLIENT_THUMBNAIL, "/_matrix/media/v3/thumbnail"));
            urls.add(replacePathPrefix(uri, CLIENT_THUMBNAIL, "/_matrix/media/r0/thumbnail"));
        }
    }

    private static String replacePathPrefix(Uri uri, String sourcePrefix, String targetPrefix) {
        String path = uri.getPath();
        if (path == null) return uri.toString();
        return uri.buildUpon().path(targetPrefix + path.substring(sourcePrefix.length())).build().toString();
    }

    private static boolean isSessionMediaUrl(String sourceUrl, String baseUrl) {
        if (baseUrl == null || baseUrl.isEmpty()) return false;
        try {
            URL source = new URL(sourceUrl);
            URL base = new URL(baseUrl);
            String path = source.getPath();
            return sameOrigin(source, base) && path.matches("(?i)^/_matrix/(client/[^/]+/media|media/[^/]+)/(download|thumbnail)/.*");
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean sameOrigin(URL left, URL right) {
        return left.getProtocol().equalsIgnoreCase(right.getProtocol()) &&
            left.getHost().equalsIgnoreCase(right.getHost()) &&
            effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(URL url) {
        return url.getPort() >= 0 ? url.getPort() : url.getDefaultPort();
    }

    private static String withAccessToken(String sourceUrl, String accessToken) {
        Uri uri = Uri.parse(sourceUrl);
        return uri.buildUpon().appendQueryParameter("access_token", accessToken).build().toString();
    }

    private static String removeQueryParameter(String sourceUrl, String parameter) {
        try {
            Uri uri = Uri.parse(sourceUrl);
            Uri.Builder builder = uri.buildUpon().clearQuery();
            for (String name : uri.getQueryParameterNames()) {
                if (name.equals(parameter)) continue;
                for (String value : uri.getQueryParameters(name)) {
                    builder.appendQueryParameter(name, value);
                }
            }
            return builder.build().toString();
        } catch (Exception ignored) {
            return sourceUrl;
        }
    }

    private static String normalizeSourceUrl(String sourceUrl) {
        Uri uri = Uri.parse(sourceUrl);
        TreeMap<String, List<String>> query = new TreeMap<>();
        for (String name : uri.getQueryParameterNames()) {
            if ("access_token".equalsIgnoreCase(name) || "allow_redirect".equalsIgnoreCase(name)) {
                continue;
            }
            List<String> values = query.computeIfAbsent(name, ignored -> new ArrayList<>());
            values.addAll(uri.getQueryParameters(name));
        }
        Uri.Builder builder = uri.buildUpon().clearQuery();
        for (Map.Entry<String, List<String>> entry : query.entrySet()) {
            for (String value : entry.getValue()) builder.appendQueryParameter(entry.getKey(), value);
        }
        return builder.build().toString();
    }

    private static String normalizeMimeType(String mimeType) {
        if (mimeType == null) return null;
        String normalized = mimeType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private static boolean isInvalidMediaType(String mimeType) {
        return mimeType != null &&
            (mimeType.startsWith("text/html") || mimeType.startsWith("application/json"));
    }

    private static boolean looksLikeHtmlOrJson(File file, String mimeType) {
        if (isInvalidMediaType(mimeType)) return true;
        byte[] prefix = new byte[64];
        try (FileInputStream input = new FileInputStream(file)) {
            int read = input.read(prefix);
            if (read <= 0) return true;
            String value = new String(prefix, 0, read, StandardCharsets.UTF_8).trim().toLowerCase(Locale.ROOT);
            return value.startsWith("<!doctype html") || value.startsWith("<html") || value.startsWith("{");
        } catch (Exception ignored) {
            return true;
        }
    }

    private static String extensionForMimeType(String mimeType) {
        if (mimeType == null) return "bin";
        if (mimeType.contains("png")) return "png";
        if (mimeType.contains("jpeg") || mimeType.contains("jpg")) return "jpg";
        if (mimeType.contains("gif")) return "gif";
        if (mimeType.contains("webp")) return "webp";
        if (mimeType.contains("avif")) return "avif";
        if (mimeType.contains("svg")) return "svg";
        return "bin";
    }

    private static String mimeTypeFromExtension(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".avif")) return "image/avif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private static File findCachedFile(File assetDir) {
        File[] files = assetDir.listFiles(file -> file.isFile() && file.getName().startsWith("media.") && !file.getName().endsWith(".download"));
        return files != null && files.length > 0 ? files[0] : null;
    }

    private static void deleteCachedFiles(File assetDir) {
        File[] files = assetDir.listFiles(file -> file.isFile() && file.getName().startsWith("media.") && !file.getName().endsWith(".download"));
        if (files != null) for (File file : files) file.delete();
    }

    private static void copyFile(File source, File target) throws Exception {
        try (FileInputStream input = new FileInputStream(source); FileOutputStream output = new FileOutputStream(target, false)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
        }
    }

    private static String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item));
        return result.toString();
    }

    private static void pruneAccountCache(File accountDir) {
        File[] assetDirs = accountDir.listFiles(File::isDirectory);
        if (assetDirs == null || assetDirs.length == 0) return;
        List<File> sorted = new ArrayList<>(Arrays.asList(assetDirs));
        sorted.sort(Comparator.comparingLong(File::lastModified));
        long totalBytes = 0;
        int totalFiles = 0;
        for (File assetDir : sorted) {
            File media = findCachedFile(assetDir);
            if (media != null) {
                totalBytes += media.length();
                totalFiles += 1;
            }
        }
        for (File assetDir : sorted) {
            if (totalFiles <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) break;
            File media = findCachedFile(assetDir);
            if (media != null) {
                totalBytes -= media.length();
                totalFiles -= 1;
            }
            deleteRecursively(assetDir);
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
