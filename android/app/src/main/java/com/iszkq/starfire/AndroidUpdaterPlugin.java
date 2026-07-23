package com.iszkq.starfire;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidUpdater")
public class AndroidUpdaterPlugin extends Plugin {
    private Long activeDownloadId;
    private PluginCall activeCall;

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (activeDownloadId == null || activeDownloadId != downloadId) return;

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            PluginCall call = activeCall;
            activeDownloadId = null;
            activeCall = null;
            if (call == null) return;

            try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
                if (!cursor.moveToFirst()) {
                    call.reject("无法读取安装包下载状态。");
                    return;
                }

                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status != DownloadManager.STATUS_SUCCESSFUL) {
                    int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    call.reject("安装包下载失败，错误码：" + reason);
                    return;
                }
            }

            Uri apkUri = manager.getUriForDownloadedFile(downloadId);
            if (apkUri == null) {
                call.reject("无法打开已下载的安装包。");
                return;
            }

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(installIntent);

            JSObject result = new JSObject();
            result.put("installerOpened", true);
            call.resolve(result);
        }
    };

    @Override
    public void load() {
        super.load();
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        ContextCompat.registerReceiver(
            getContext(),
            downloadReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException ignored) {
            // The receiver may already be unregistered while Android is tearing down the activity.
        }
        if (activeCall != null) {
            activeCall.reject("更新已取消。");
            activeCall = null;
        }
        activeDownloadId = null;
        super.handleOnDestroy();
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
        if (activeCall != null) {
            call.reject("已有更新正在下载。");
            return;
        }

        fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (!fileName.toLowerCase().endsWith(".apk")) fileName += ".apk";

        try {
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

            DownloadManager manager = (DownloadManager) getContext().getSystemService(
                Context.DOWNLOAD_SERVICE
            );
            activeDownloadId = manager.enqueue(request);
            activeCall = call;
        } catch (Exception error) {
            activeDownloadId = null;
            activeCall = null;
            call.reject("无法开始下载更新。", error);
        }
    }
}
