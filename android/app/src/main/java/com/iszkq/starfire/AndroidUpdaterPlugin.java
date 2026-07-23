package com.iszkq.starfire;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Locale;

@CapacitorPlugin(name = "AndroidUpdater")
public class AndroidUpdaterPlugin extends Plugin {
    private static final String PREFERENCES_NAME = "starfire_android_updater";
    private static final String ACTIVE_DOWNLOAD_ID_KEY = "active_download_id";
    private static final long NO_DOWNLOAD_ID = -1L;
    private static final long PROGRESS_POLL_INTERVAL_MS = 700L;

    private Long activeDownloadId;
    private Handler progressHandler;

    private static class DownloadSnapshot {
        final int status;
        final int reason;
        final long bytesDownloaded;
        final long totalBytes;

        DownloadSnapshot(int status, int reason, long bytesDownloaded, long totalBytes) {
            this.status = status;
            this.reason = reason;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
        }
    }

    private final Runnable progressPoller = new Runnable() {
        @Override
        public void run() {
            if (activeDownloadId == null) return;
            handleDownloadUpdate();
        }
    };

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, NO_DOWNLOAD_ID);
            if (activeDownloadId == null || activeDownloadId != downloadId) return;
            handleDownloadUpdate();
        }
    };

    @Override
    public void load() {
        super.load();
        progressHandler = new Handler(Looper.getMainLooper());

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        ContextCompat.registerReceiver(
            getContext(),
            downloadReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );

        long persistedDownloadId = getPreferences().getLong(
            ACTIVE_DOWNLOAD_ID_KEY,
            NO_DOWNLOAD_ID
        );
        if (persistedDownloadId != NO_DOWNLOAD_ID) {
            activeDownloadId = persistedDownloadId;
            progressHandler.post(progressPoller);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException ignored) {
            // The receiver may already be unregistered while Android is tearing down the activity.
        }
        stopProgressPolling();
        super.handleOnDestroy();
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private DownloadManager getDownloadManager() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private void persistActiveDownload(long downloadId) {
        activeDownloadId = downloadId;
        getPreferences().edit().putLong(ACTIVE_DOWNLOAD_ID_KEY, downloadId).apply();
    }

    private void clearActiveDownload() {
        activeDownloadId = null;
        getPreferences().edit().remove(ACTIVE_DOWNLOAD_ID_KEY).apply();
        stopProgressPolling();
    }

    private void startProgressPolling() {
        if (progressHandler == null || activeDownloadId == null) return;
        progressHandler.removeCallbacks(progressPoller);
        progressHandler.postDelayed(progressPoller, PROGRESS_POLL_INTERVAL_MS);
    }

    private void stopProgressPolling() {
        if (progressHandler != null) {
            progressHandler.removeCallbacks(progressPoller);
        }
    }

    private DownloadSnapshot queryDownload(long downloadId) {
        DownloadManager manager = getDownloadManager();
        if (manager == null) return null;

        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (!cursor.moveToFirst()) return null;

            return new DownloadSnapshot(
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
                cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isActiveStatus(int status) {
        return status == DownloadManager.STATUS_PENDING
            || status == DownloadManager.STATUS_RUNNING
            || status == DownloadManager.STATUS_PAUSED;
    }

    private String getStatusName(int status) {
        switch (status) {
            case DownloadManager.STATUS_PENDING:
                return "pending";
            case DownloadManager.STATUS_RUNNING:
                return "running";
            case DownloadManager.STATUS_PAUSED:
                return "paused";
            case DownloadManager.STATUS_SUCCESSFUL:
                return "successful";
            case DownloadManager.STATUS_FAILED:
                return "failed";
            default:
                return "idle";
        }
    }

    private JSObject buildStatus(long downloadId, DownloadSnapshot snapshot) {
        JSObject result = new JSObject();
        boolean active = snapshot != null && isActiveStatus(snapshot.status);
        result.put("downloadId", downloadId);
        result.put("active", active);
        result.put("state", snapshot == null ? "idle" : getStatusName(snapshot.status));
        result.put("reason", snapshot == null ? 0 : snapshot.reason);
        result.put("bytesDownloaded", snapshot == null ? 0 : snapshot.bytesDownloaded);
        result.put("totalBytes", snapshot == null ? -1 : snapshot.totalBytes);

        int percent = -1;
        if (snapshot != null && snapshot.totalBytes > 0) {
            percent = (int) Math.min(100, (snapshot.bytesDownloaded * 100L) / snapshot.totalBytes);
        }
        result.put("percent", percent);
        return result;
    }

    private void emitStatus(long downloadId, DownloadSnapshot snapshot) {
        notifyListeners("downloadProgress", buildStatus(downloadId, snapshot));
    }

    private boolean openInstaller(long downloadId) {
        DownloadManager manager = getDownloadManager();
        if (manager == null) return false;

        Uri apkUri = manager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) return false;

        try {
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(installIntent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void handleDownloadUpdate() {
        Long downloadId = activeDownloadId;
        if (downloadId == null) return;

        DownloadSnapshot snapshot = queryDownload(downloadId);
        if (snapshot == null) {
            clearActiveDownload();
            JSObject result = buildStatus(downloadId, null);
            result.put("state", "failed");
            result.put("reason", -1);
            notifyListeners("downloadProgress", result);
            return;
        }

        emitStatus(downloadId, snapshot);

        if (isActiveStatus(snapshot.status)) {
            startProgressPolling();
            return;
        }

        if (snapshot.status == DownloadManager.STATUS_SUCCESSFUL) {
            boolean installerOpened = openInstaller(downloadId);
            JSObject result = buildStatus(downloadId, snapshot);
            result.put("installerOpened", installerOpened);
            notifyListeners("downloadProgress", result);
            clearActiveDownload();
            return;
        }

        if (snapshot.status == DownloadManager.STATUS_FAILED) {
            clearActiveDownload();
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }

        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        Long downloadId = activeDownloadId;
        if (downloadId == null) {
            JSObject result = new JSObject();
            result.put("active", false);
            result.put("state", "idle");
            result.put("percent", -1);
            result.put("bytesDownloaded", 0);
            result.put("totalBytes", -1);
            result.put("reason", 0);
            call.resolve(result);
            return;
        }

        DownloadSnapshot snapshot = queryDownload(downloadId);
        if (snapshot == null) {
            clearActiveDownload();
            JSObject result = buildStatus(downloadId, null);
            result.put("state", "failed");
            result.put("reason", -1);
            call.resolve(result);
            return;
        }

        call.resolve(buildStatus(downloadId, snapshot));
        if (isActiveStatus(snapshot.status)) {
            startProgressPolling();
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        Long downloadId = activeDownloadId;
        if (downloadId == null) {
            call.resolve();
            return;
        }

        DownloadManager manager = getDownloadManager();
        if (manager != null) {
            manager.remove(downloadId);
        }
        clearActiveDownload();

        JSObject result = new JSObject();
        result.put("downloadId", downloadId);
        result.put("active", false);
        result.put("state", "cancelled");
        result.put("percent", -1);
        result.put("bytesDownloaded", 0);
        result.put("totalBytes", -1);
        result.put("reason", 0);
        notifyListeners("downloadProgress", result);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "Starfire-update.apk");
        Uri updateUri = url == null ? null : Uri.parse(url);
        if (
            updateUri == null
                || !"https".equalsIgnoreCase(updateUri.getScheme())
                || !"github.com".equalsIgnoreCase(updateUri.getHost())
        ) {
            call.reject("更新地址无效。");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("请先允许星火安装未知应用。");
            return;
        }

        if (activeDownloadId != null) {
            DownloadSnapshot activeSnapshot = queryDownload(activeDownloadId);
            if (activeSnapshot != null && isActiveStatus(activeSnapshot.status)) {
                emitStatus(activeDownloadId, activeSnapshot);
                startProgressPolling();
                JSObject result = buildStatus(activeDownloadId, activeSnapshot);
                result.put("started", false);
                result.put("alreadyDownloading", true);
                result.put("installerOpened", false);
                call.resolve(result);
                return;
            }

            if (activeSnapshot != null && activeSnapshot.status == DownloadManager.STATUS_SUCCESSFUL) {
                boolean installerOpened = openInstaller(activeDownloadId);
                long completedDownloadId = activeDownloadId;
                clearActiveDownload();
                JSObject result = buildStatus(completedDownloadId, activeSnapshot);
                result.put("started", false);
                result.put("alreadyDownloading", false);
                result.put("installerOpened", installerOpened);
                call.resolve(result);
                return;
            }

            clearActiveDownload();
        }

        fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (!fileName.toLowerCase(Locale.ROOT).endsWith(".apk")) fileName += ".apk";

        try {
            File downloadsDirectory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDirectory != null) {
                File previousFile = new File(downloadsDirectory, fileName);
                if (previousFile.exists()) previousFile.delete();
            }

            DownloadManager.Request request = new DownloadManager.Request(updateUri);
            request.setTitle("星火更新");
            request.setDescription("正在下载新版安装包");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalFilesDir(
                getContext(),
                Environment.DIRECTORY_DOWNLOADS,
                fileName
            );

            DownloadManager manager = getDownloadManager();
            if (manager == null) {
                call.reject("系统下载服务不可用。");
                return;
            }

            long downloadId = manager.enqueue(request);
            persistActiveDownload(downloadId);
            DownloadSnapshot snapshot = queryDownload(downloadId);
            if (snapshot == null) {
                snapshot = new DownloadSnapshot(DownloadManager.STATUS_PENDING, 0, 0, -1);
            }
            emitStatus(downloadId, snapshot);
            startProgressPolling();

            JSObject result = buildStatus(downloadId, snapshot);
            result.put("started", true);
            result.put("alreadyDownloading", false);
            result.put("installerOpened", false);
            call.resolve(result);
        } catch (Exception error) {
            clearActiveDownload();
            call.reject("无法开始下载更新。", error);
        }
    }
}
