package com.iszkq.starfire;
import android.graphics.Color;
import android.os.Build;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAppearance")
public class NativeAppearancePlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        boolean dark = call.getBoolean("dark", true);
        int background;
        try { background = Color.parseColor(call.getString("background", "#17191e")); }
        catch (IllegalArgumentException error) { call.reject("Invalid background color"); return; }
        final int color = background;
        getActivity().runOnUiThread(() -> {
            var window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(color);
            getBridge().getWebView().setBackgroundColor(color);
            if (Build.VERSION.SDK_INT < 35) {
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            var controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
