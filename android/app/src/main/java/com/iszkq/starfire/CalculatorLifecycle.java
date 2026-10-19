package com.iszkq.starfire;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

/** Device-local lock state. Contains no PIN, account or message data. */
public final class CalculatorLifecycle {
    private final SharedPreferences prefs;
    private final String instanceId = java.util.UUID.randomUUID().toString();
    public CalculatorLifecycle(Context context) {
        prefs = context.getSharedPreferences("calculator_lifecycle_v2", Context.MODE_PRIVATE);
    }
    @JavascriptInterface public String read() {
        JSONObject result = new JSONObject();
        try {
            result.put("instanceId", instanceId);
            result.put("state", prefs.getString("state", null));
            result.put("awayAt", prefs.getLong("awayAt", 0));
            result.put("resumeToken", prefs.getString("resumeToken", ""));
            result.put("resumedAt", prefs.getLong("resumedAt", 0));
            result.put("foreground", prefs.getBoolean("foreground", false));
        } catch (Exception ignored) { }
        return result.toString();
    }
    public void save(String state) {
        try {
            JSONObject value = new JSONObject(state);
            // Restrict the native record to lock policy fields.
            JSONObject safe = new JSONObject();
            safe.put("instanceId", value.optString("instanceId", instanceId));
            safe.put("locked", value.getBoolean("locked"));
            safe.put("lastSeen", value.getLong("lastSeen"));
            safe.put("delaySeconds", value.getInt("delaySeconds"));
            if (value.has("awayAt")) safe.put("awayAt", value.getLong("awayAt"));
            prefs.edit().putString("state", safe.toString()).apply();
        } catch (Exception ignored) { }
    }
    public void acknowledgeResume(String token) {
        if (token != null && token.equals(prefs.getString("resumeToken", "")) && prefs.getBoolean("foreground", false)) prefs.edit().remove("awayAt").apply();
    }
    public void pause() {
        SharedPreferences.Editor editor = prefs.edit().putBoolean("foreground", false);
        if (prefs.getBoolean("foreground", true) || prefs.getLong("awayAt", 0) == 0) editor.putLong("awayAt", System.currentTimeMillis());
        editor.apply();
    }
    public void resume() {
        prefs.edit().putBoolean("foreground", true).putLong("resumedAt", System.currentTimeMillis()).putString("resumeToken", java.util.UUID.randomUUID().toString()).apply();
    }
    public boolean shouldShowCalculator() {
        try {
            String stored = prefs.getString("state", null);
            if (stored == null) return false;
            JSONObject state = new JSONObject(stored);
            if (state.optBoolean("locked", false)) return true;
            long away = prefs.getLong("awayAt", state.optLong("awayAt", 0));
            return away > 0 && System.currentTimeMillis() - away >= state.optLong("delaySeconds", 30) * 1000L;
        } catch (Exception ignored) { return false; }
    }
    public long remainingDelay() {
        try {
            JSONObject state = new JSONObject(prefs.getString("state", "{}"));
            long away = prefs.getLong("awayAt", 0);
            return Math.max(0, state.optLong("delaySeconds", 30) * 1000L - (System.currentTimeMillis() - away));
        } catch (Exception ignored) { return 30000; }
    }
}
