package com.iszkq.starfire;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "NativeFileSaver")
public class NativeFileSaverPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Native downloads require Android 10 or newer.");
            return;
        }

        String fileName = call.getString("fileName", "download");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("Missing file data.");
            return;
        }

        fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (fileName.isEmpty()) fileName = "download";

        Uri fileUri = null;
        try {
            byte[] fileBytes = Base64.decode(dataBase64, Base64.DEFAULT);
            boolean imageFile = mimeType.toLowerCase().startsWith("image/");
            Uri collection = imageFile
                ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            String relativePath = imageFile
                ? Environment.DIRECTORY_DCIM + "/Camera"
                : Environment.DIRECTORY_DOWNLOADS + "/Starfire";
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                relativePath
            );
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            ContentResolver resolver = getContext().getContentResolver();
            fileUri = resolver.insert(collection, values);
            if (fileUri == null) throw new IllegalStateException("Unable to create download file.");

            try (OutputStream output = resolver.openOutputStream(fileUri, "w")) {
                if (output == null) throw new IllegalStateException("Unable to open download file.");
                output.write(fileBytes);
                output.flush();
            }

            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(fileUri, values, null, null);

            JSObject result = new JSObject();
            result.put("uri", fileUri.toString());
            result.put("fileName", fileName);
            String savedName = fileName;
            String savedLocation = imageFile ? "默认相册" : "下载/Starfire";
            getActivity().runOnUiThread(
                () -> Toast.makeText(
                    getContext(),
                    "已保存到" + savedLocation + "：" + savedName,
                    Toast.LENGTH_LONG
                ).show()
            );
            call.resolve(result);
        } catch (Exception error) {
            if (fileUri != null) {
                getContext().getContentResolver().delete(fileUri, null, null);
            }
            call.reject("Failed to save downloaded file.", error);
        }
    }
}
