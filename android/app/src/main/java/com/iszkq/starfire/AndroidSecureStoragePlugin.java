package com.iszkq.starfire;

import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AndroidSecureStorage")
public class AndroidSecureStoragePlugin extends Plugin {
    private static final String PREFS = "cinny_secure_storage";
    private static final String KEY_ALIAS = "cinny_secret_storage_key_v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance("AES", ANDROID_KEYSTORE);
        generator.init(256);
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] output = new byte[cipher.getIV().length + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, output, 0, cipher.getIV().length);
        System.arraycopy(encrypted, 0, output, cipher.getIV().length, encrypted.length);
        return Base64.encodeToString(output, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        byte[] input = Base64.decode(value, Base64.NO_WRAP);
        byte[] iv = new byte[12];
        byte[] encrypted = new byte[input.length - iv.length];
        System.arraycopy(input, 0, iv, 0, iv.length);
        System.arraycopy(input, iv.length, encrypted, 0, encrypted.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void getAll(PluginCall call) {
        try {
            JSObject result = new JSObject();
            SharedPreferences preferences = getContext().getSharedPreferences(PREFS, 0);
            Map<String, ?> values = preferences.getAll();
            SharedPreferences.Editor cleanup = null;
            for (Map.Entry<String, ?> entry : values.entrySet()) {
                if (!(entry.getValue() instanceof String)) continue;
                try {
                    result.put(entry.getKey(), decrypt((String) entry.getValue()));
                } catch (Exception corruptEntry) {
                    // One stale/corrupt value must never hide every other
                    // account's verification marker and backup key. Remove
                    // only the unreadable entry and return all healthy values.
                    if (cleanup == null) cleanup = preferences.edit();
                    cleanup.remove(entry.getKey());
                }
            }
            if (cleanup != null) cleanup.commit();
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read secure storage.", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("key and value are required"); return; }
        try {
            boolean committed = getContext().getSharedPreferences(PREFS, 0)
                .edit()
                .putString(key, encrypt(value))
                .commit();
            if (!committed) {
                call.reject("Unable to commit secure storage.");
                return;
            }
            call.resolve();
        } catch (Exception error) { call.reject("Unable to write secure storage.", error); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        boolean committed = getContext().getSharedPreferences(PREFS, 0).edit().remove(key).commit();
        if (!committed) { call.reject("Unable to commit secure storage removal."); return; }
        call.resolve();
    }
}
