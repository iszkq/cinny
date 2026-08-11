package com.iszkq.starfire;

import android.content.pm.ActivityInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OfficeOrientation")
public class OfficeOrientationPlugin extends Plugin {
    private Integer previousOrientation;

    @PluginMethod
    public void lockLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (previousOrientation == null) {
                previousOrientation = getActivity().getRequestedOrientation();
            }
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            int orientation = previousOrientation != null
                ? previousOrientation
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
            previousOrientation = null;
            getActivity().setRequestedOrientation(orientation);
            call.resolve(new JSObject());
        });
    }
}
