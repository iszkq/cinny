package com.iszkq.starfire;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Diagnostic APKs can be inspected live through chrome://inspect while a phone is
        // connected. Never expose remote WebView debugging in signed release builds.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        registerPlugin(NativeFileSaverPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        registerPlugin(AndroidMediaCachePlugin.class);
        registerPlugin(OfficeOrientationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
