package com.iszkq.starfire;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Color;
import android.view.Gravity;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private CalculatorLifecycle calculatorLifecycle;
    private Runnable delayedLockCover;
    private View privacyCover;
    private int coverGeneration;
    private boolean foreground;
    private final Handler coverHandler = new Handler(Looper.getMainLooper());
    private Runnable coverRetry;
    private String resumeProbe = "false";

    private void loadResumeProbe() {
        try (java.io.InputStream input = getAssets().open("calculator-resume.js")) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            resumeProbe = output.toString("UTF-8");
        } catch (java.io.IOException ignored) { }
    }

    // Keep the shield until React has handled resume and committed the correct
    // locked/unlocked page. Animation frames may be suspended while covered.
    private void restorePrivatePage() {
        if (!foreground || privacyCover == null || getBridge() == null) return;
        if (coverRetry != null) coverHandler.removeCallbacks(coverRetry);
        final int generation = coverGeneration;
        final long started = android.os.SystemClock.uptimeMillis();
        getBridge().getWebView().onResume();
        getBridge().getWebView().resumeTimers();
        coverRetry = new Runnable() {
            private boolean recoveryOffered;
            @Override public void run() {
                if (!foreground || generation != coverGeneration || privacyCover == null) return;
                WebView web = getBridge().getWebView();
                String script = resumeProbe;
                web.evaluateJavascript(script, result -> {
                    if (!foreground || generation != coverGeneration || privacyCover == null) return;
                    if ("true".equals(result)) {
                        View cover = privacyCover;
                        privacyCover = null;
                        if (cover.getParent() instanceof ViewGroup) ((ViewGroup) cover.getParent()).removeView(cover);
                        coverHandler.removeCallbacks(this);
                        web.requestFocus();
                    }
                });
                long elapsed = android.os.SystemClock.uptimeMillis() - started;
                if (elapsed > 8000 && !recoveryOffered && privacyCover instanceof LinearLayout) {
                    recoveryOffered = true;
                    android.widget.Button retry = new android.widget.Button(MainActivity.this);
                    retry.setText("恢复计算器");
                    retry.setOnClickListener(view -> web.reload());
                    ((LinearLayout) privacyCover).addView(retry, 0);
                }
                coverHandler.postDelayed(this, 250);
            }
        };
        coverHandler.post(coverRetry);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            if (getBridge() != null && foreground) getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('calculator-native-resume',{cancelable:true}))", null);
            restorePrivatePage();
        }
    }

    @Override public void onDestroy() {
        coverHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
    private void coverPrivatePage() {
        coverGeneration++;
        if (privacyCover != null) return;
        LinearLayout cover = new LinearLayout(this);
        cover.setOrientation(LinearLayout.VERTICAL);
        cover.setGravity(Gravity.BOTTOM);
        cover.setBackgroundColor(Color.rgb(23, 25, 30));
        int gap = (int)(20 * getResources().getDisplayMetrics().density);
        cover.setPadding(gap, gap, gap, gap * 2);
        TextView display = new TextView(this);
        display.setText("计算器"); display.setTextSize(32); display.setTextColor(Color.WHITE);
        cover.addView(display);
        TextView loading = new TextView(this);
        loading.setText("正在恢复计算器…"); loading.setTextSize(18); loading.setTextColor(Color.WHITE);
        cover.addView(loading);
        addContentView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        privacyCover = cover;
    }
    @Override public void onPause() {
        foreground = false;
        if (coverRetry != null) coverHandler.removeCallbacks(coverRetry);
        if (calculatorLifecycle != null) calculatorLifecycle.pause();
        delayedLockCover = () -> {
            if (!foreground && calculatorLifecycle != null && calculatorLifecycle.shouldShowCalculator()) coverPrivatePage();
        };
        if (calculatorLifecycle != null) coverHandler.postDelayed(delayedLockCover, calculatorLifecycle.remainingDelay());
        if (getBridge() != null) getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('calculator-native-background'))", null);
        super.onPause();
    }
    @Override public void onResume() {
        super.onResume();
        foreground = true;
        if (delayedLockCover != null) coverHandler.removeCallbacks(delayedLockCover);
        if (calculatorLifecycle != null) {
            calculatorLifecycle.resume();
            if (calculatorLifecycle.shouldShowCalculator()) coverPrivatePage();
        }
        if (getBridge() != null) {
            getBridge().getWebView().onResume();
            getBridge().getWebView().resumeTimers();
            getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('calculator-native-resume',{cancelable:true}))", null);
        }
        restorePrivatePage();
    }

    public CalculatorLifecycle getCalculatorLifecycle() { return calculatorLifecycle; }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Diagnostic APKs can be inspected live through chrome://inspect while a phone is
        // connected. Never expose remote WebView debugging in signed release builds.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        loadResumeProbe();
        calculatorLifecycle = new CalculatorLifecycle(this);
        registerPlugin(CalculatorLifecyclePlugin.class);
        registerPlugin(NativeAppearancePlugin.class);
        registerPlugin(NativeFileSaverPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        registerPlugin(AndroidMediaCachePlugin.class);
        registerPlugin(AndroidSecureStoragePlugin.class);
        registerPlugin(AndroidClientStorePlugin.class);
        registerPlugin(NativeClipboardPlugin.class);
        registerPlugin(OfficeOrientationPlugin.class);
        super.onCreate(savedInstanceState);

    }
}
