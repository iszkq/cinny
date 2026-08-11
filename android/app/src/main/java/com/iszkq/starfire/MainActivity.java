package com.iszkq.starfire;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeFileSaverPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        registerPlugin(AndroidMediaCachePlugin.class);
        registerPlugin(OfficeOrientationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
