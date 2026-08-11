package com.iszkq.starfire;

import android.content.pm.ActivityInfo;
import android.view.OrientationEventListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OfficeOrientation")
public class OfficeOrientationPlugin extends Plugin {
    private Integer previousOrientation;
    private OrientationEventListener orientationListener;
    private boolean officeOrientationActive;

    private void stopOrientationListener() {
        if (orientationListener != null) {
            orientationListener.disable();
            orientationListener = null;
        }
    }

    @PluginMethod
    public void lockLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (previousOrientation == null) {
                previousOrientation = getActivity().getRequestedOrientation();
            }
            officeOrientationActive = true;
            stopOrientationListener();
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

            // Start every edit session in landscape, then release the lock as
            // soon as the user physically holds the phone in landscape. From
            // that point Android follows the user's rotation preference and
            // they can turn the document back to portrait normally.
            orientationListener = new OrientationEventListener(getContext()) {
                @Override
                public void onOrientationChanged(int orientation) {
                    if (!officeOrientationActive || orientation == ORIENTATION_UNKNOWN) return;
                    boolean physicallyLandscape =
                        (orientation >= 45 && orientation <= 135) ||
                        (orientation >= 225 && orientation <= 315);
                    if (!physicallyLandscape) return;

                    getActivity().runOnUiThread(() -> {
                        if (!officeOrientationActive) return;
                        stopOrientationListener();
                        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
                    });
                }
            };
            if (orientationListener.canDetectOrientation()) {
                orientationListener.enable();
            } else {
                stopOrientationListener();
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
            }
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            officeOrientationActive = false;
            stopOrientationListener();
            int orientation = previousOrientation != null
                ? previousOrientation
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
            previousOrientation = null;
            getActivity().setRequestedOrientation(orientation);
            call.resolve(new JSObject());
        });
    }
}
