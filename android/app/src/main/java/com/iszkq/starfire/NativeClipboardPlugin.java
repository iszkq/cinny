package com.iszkq.starfire;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeClipboard")
public class NativeClipboardPlugin extends Plugin {
    @PluginMethod
    public void writeText(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("Clipboard text is required.");
            return;
        }

        ClipboardManager clipboard =
            (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            call.reject("Android clipboard is unavailable.");
            return;
        }

        clipboard.setPrimaryClip(ClipData.newPlainText("Starfire diagnostics", text));
        boolean verified = clipboard.hasPrimaryClip();
        if (verified && clipboard.getPrimaryClip() != null && clipboard.getPrimaryClip().getItemCount() > 0) {
            CharSequence copied = clipboard.getPrimaryClip().getItemAt(0).coerceToText(getContext());
            verified = text.contentEquals(copied);
        }

        JSObject result = new JSObject();
        result.put("verified", verified);
        call.resolve(result);
    }
}
