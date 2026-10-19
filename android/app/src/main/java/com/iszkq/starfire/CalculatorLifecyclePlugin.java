package com.iszkq.starfire;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CalculatorLifecycleBridge")
public class CalculatorLifecyclePlugin extends Plugin {
    private CalculatorLifecycle lifecycle;
    @Override public void load() {
        lifecycle = ((MainActivity) getActivity()).getCalculatorLifecycle();
        // Read-only snapshot is available before the first page is loaded.
        // Writes use Capacitor's origin-checked message channel.
        getBridge().getWebView().addJavascriptInterface(lifecycle, "CalculatorLifecycle");
    }
    @PluginMethod public void saveState(PluginCall call) {
        String state = call.getString("state");
        if (state != null) lifecycle.save(state);
        call.resolve();
    }
    @PluginMethod public void acknowledgeResume(PluginCall call) {
        lifecycle.acknowledgeResume(call.getString("token"));
        call.resolve();
    }
}
