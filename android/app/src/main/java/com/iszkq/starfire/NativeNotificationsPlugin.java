package com.iszkq.starfire;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.PermissionState;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
    name = "NativeNotifications",
    permissions = {
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        )
    }
)
public class NativeNotificationsPlugin extends Plugin {
    private static final String MESSAGE_CHANNEL_ID = "starfire_messages";
    private static final String SILENT_CHANNEL_ID = "starfire_messages_silent";
    private static final AtomicInteger NEXT_NOTIFICATION_ID = new AtomicInteger(1000);

    @Override
    @PluginMethod
    @PermissionCallback
    public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolvePermissionGranted(call);
            return;
        }
        super.checkPermissions(call);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolvePermissionGranted(call);
            return;
        }
        super.requestPermissions(call);
    }

    private void resolvePermissionGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", PermissionState.GRANTED.toString());
        call.resolve(result);
    }

    @Override
    public void load() {
        super.load();
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getContext().getSystemService(
            Context.NOTIFICATION_SERVICE
        );

        NotificationChannel messageChannel = new NotificationChannel(
            MESSAGE_CHANNEL_ID,
            "聊天消息",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        messageChannel.setDescription("星火新消息通知");

        NotificationChannel silentChannel = new NotificationChannel(
            SILENT_CHANNEL_ID,
            "静音聊天消息",
            NotificationManager.IMPORTANCE_LOW
        );
        silentChannel.setDescription("不播放声音的星火新消息通知");
        silentChannel.setSound(null, null);

        manager.createNotificationChannel(messageChannel);
        manager.createNotificationChannel(silentChannel);
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            call.reject("请先允许星火发送通知。");
            return;
        }

        String title = call.getString("title", "星火");
        String body = call.getString("body", "");
        boolean silent = Boolean.TRUE.equals(call.getBoolean("silent", false));
        String channelId = silent ? SILENT_CHANNEL_ID : MESSAGE_CHANNEL_ID;

        Intent launchIntent = new Intent(getContext(), MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            getContext(),
            NEXT_NOTIFICATION_ID.get(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(silent ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        if (silent) builder.setSilent(true);

        try {
            NotificationManagerCompat.from(getContext()).notify(
                NEXT_NOTIFICATION_ID.getAndIncrement(),
                builder.build()
            );
            call.resolve();
        } catch (SecurityException error) {
            call.reject("系统通知权限不可用。", error);
        }
    }
}
