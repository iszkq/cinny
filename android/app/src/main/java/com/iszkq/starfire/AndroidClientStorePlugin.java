package com.iszkq.starfire;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import android.system.Os;

/**
 * Durable Android-only fallback for the Matrix sync snapshot.
 *
 * The SDK's primary store remains IndexedDB. Android WebView may occasionally
 * discard or degrade that cache when its renderer is killed, so this plugin
 * keeps the latest complete snapshot in the app's private files directory.
 * Files survive ordinary process death and app upgrades and are removed by an
 * uninstall. Writes use a temporary file plus rename so a killed process never
 * replaces a good snapshot with a partial one.
 */
@CapacitorPlugin(name = "AndroidClientStore")
public class AndroidClientStorePlugin extends Plugin {
    private static final String STORE_ROOT = "android-client-store-v1";
    private static final ExecutorService STORE_EXECUTOR = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void load(PluginCall call) {
        STORE_EXECUTOR.execute(() -> {
            String accountKey = call.getString("accountKey");
            if (accountKey == null || accountKey.trim().isEmpty()) {
                call.reject("accountKey is required");
                return;
            }

            File snapshot = snapshotFile(accountKey);
            if (!snapshot.isFile() || snapshot.length() == 0) {
                call.resolve(new JSObject());
                return;
            }

            try (
                GZIPInputStream gzip = new GZIPInputStream(
                    new BufferedInputStream(new FileInputStream(snapshot))
                );
                ByteArrayOutputStream output = new ByteArrayOutputStream()
            ) {
                byte[] buffer = new byte[32 * 1024];
                int count;
                while ((count = gzip.read(buffer)) != -1) output.write(buffer, 0, count);
                String json = output.toString(StandardCharsets.UTF_8.name());
                JSObject result = new JSObject();
                result.put("snapshot", new JSObject(json));
                call.resolve(result);
            } catch (Exception error) {
                // A corrupt fallback must not block IndexedDB or network sync.
                snapshot.delete();
                call.reject("Unable to load Android client snapshot.", error);
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        STORE_EXECUTOR.execute(() -> {
            String accountKey = call.getString("accountKey");
            JSObject snapshot = call.getObject("snapshot");
            if (accountKey == null || accountKey.trim().isEmpty() || snapshot == null) {
                call.reject("accountKey and snapshot are required");
                return;
            }

            File target = snapshotFile(accountKey);
            File parent = target.getParentFile();
            if (parent == null || (!parent.exists() && !parent.mkdirs())) {
                call.reject("Unable to create Android client store directory.");
                return;
            }
            File temporary = new File(parent, target.getName() + ".tmp");

            try (
                FileOutputStream fileOutput = new FileOutputStream(temporary, false);
                GZIPOutputStream gzip = new GZIPOutputStream(new BufferedOutputStream(fileOutput))
            ) {
                gzip.write(snapshot.toString().getBytes(StandardCharsets.UTF_8));
                gzip.finish();
                gzip.flush();
                fileOutput.getFD().sync();
            } catch (Exception error) {
                temporary.delete();
                call.reject("Unable to save Android client snapshot.", error);
                return;
            }

            try {
                // Linux rename replaces the old file atomically, so process
                // death leaves either the previous complete snapshot or the
                // new complete snapshot, never a missing/partial target.
                Os.rename(temporary.getAbsolutePath(), target.getAbsolutePath());
            } catch (Exception error) {
                temporary.delete();
                call.reject("Unable to commit Android client snapshot.", error);
                return;
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        STORE_EXECUTOR.execute(() -> {
            String accountKey = call.getString("accountKey");
            if (accountKey == null || accountKey.trim().isEmpty()) {
                call.reject("accountKey is required");
                return;
            }
            File target = snapshotFile(accountKey);
            File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
            temporary.delete();
            if (target.exists() && !target.delete()) {
                call.reject("Unable to remove Android client snapshot.");
                return;
            }
            call.resolve();
        });
    }

    private File snapshotFile(String accountKey) {
        File root = new File(getContext().getFilesDir(), STORE_ROOT);
        return new File(root, sha256(accountKey.trim().toLowerCase(Locale.ROOT)) + ".json.gz");
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder output = new StringBuilder(hash.length * 2);
            for (byte item : hash) output.append(String.format(Locale.ROOT, "%02x", item));
            return output.toString();
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 unavailable.", error);
        }
    }
}
