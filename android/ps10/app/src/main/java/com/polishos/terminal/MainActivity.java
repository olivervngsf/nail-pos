package com.polishos.terminal;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * PolishOS on a handheld terminal: the web app in a full-screen window, plus one extra the browser can't
 * give it: printing on the terminal's own printer. The web app talks to it through `window.PolishOSApp`
 * (only offered to pages from polishosapp.com).
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://polishosapp.com/";
    /** Only these pages get the printer. */
    private static final Set<String> TRUSTED = new HashSet<>(Arrays.asList("https://polishosapp.com", "https://www.polishosapp.com"));
    private static final int ASK_BLUETOOTH = 1, ASK_CAMERA = 2, PICK_FILE = 3;

    private WebView web;
    private final ExecutorService printing = Executors.newSingleThreadExecutor();
    private Runnable afterBluetooth;            // a print waiting for the Nearby devices answer
    private PermissionRequest cameraRequest;    // the page waiting for the camera answer
    private ValueCallback<Uri[]> filePick;      // the page waiting for a photo/file

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // sign-in + the offline outbox live here
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " PolishOSApp/1.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // card pages

        web.setWebViewClient(new Pages());
        web.setWebChromeClient(new Chrome());

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "PolishOSApp", TRUSTED,
                (view, message, origin, isMainFrame, reply) -> onMessage(message.getData(), reply));
        }

        if (saved != null) web.restoreState(saved); else web.loadUrl(HOME);
    }

    // ── Messages from the web app: {"id":"…","print":"<base64 ESC/POS>"} → {"id":"…","ok":true} or {"id":"…","error":"…"}
    private void onMessage(String text, JavaScriptReplyProxy reply) {
        final String id;
        final byte[] bytes;
        try {
            JSONObject msg = new JSONObject(text == null ? "{}" : text);
            id = msg.optString("id");
            if (!msg.has("print")) { answer(reply, id, null); return; } // "are you there?"
            bytes = Base64.decode(msg.getString("print"), Base64.DEFAULT);
        } catch (JSONException | IllegalArgumentException e) {
            return;
        }
        Runnable job = () -> printing.execute(() -> answer(reply, id, InnerPrinter.print(getApplicationContext(), bytes)));
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            afterBluetooth = () -> {
                if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) job.run();
                else answer(reply, id, "Allow Nearby devices for PolishOS, then print again.");
            };
            requestPermissions(new String[] { Manifest.permission.BLUETOOTH_CONNECT }, ASK_BLUETOOTH);
        } else {
            job.run();
        }
    }

    private void answer(JavaScriptReplyProxy reply, String id, String error) {
        try {
            JSONObject out = new JSONObject().put("id", id);
            if (error == null) out.put("ok", true); else out.put("error", error);
            final String text = out.toString();
            runOnUiThread(() -> { try { reply.postMessage(text); } catch (RuntimeException ignored) { /* page went away */ } });
        } catch (JSONException ignored) { /* can't happen with these keys */ }
    }

    // ── Pages: web links stay inside; phone, text, mail and app links open their own app.
    private final class Pages extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme();
            if ("https".equals(scheme) || "http".equals(scheme)) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (ActivityNotFoundException ignored) { /* nothing to open it */ }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            // No internet when the page was opening: a plain screen with one button, not the browser's error page.
            String retry = request.getUrl().toString().replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;");
            String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='font-family:sans-serif;text-align:center;padding:72px 24px;color:#16161A'>"
                + "<h2>No internet</h2><p style='color:#5E5E66'>Check the Wi-Fi, then try again.</p>"
                + "<p><a href=\"" + retry + "\" style='display:inline-block;margin-top:16px;padding:14px 28px;border-radius:12px;"
                + "background:#16161A;color:#fff;text-decoration:none;font-weight:600'>Try again</a></p></body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        }
    }

    // ── Camera (scan a slip) and photo/file picking.
    private final class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            Uri from = request.getOrigin();
            String origin = from == null ? "" : from.getScheme() + "://" + from.getHost();
            boolean camera = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
            if (!camera || !TRUSTED.contains(origin)) { request.deny(); return; }
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            } else {
                cameraRequest = request;
                requestPermissions(new String[] { Manifest.permission.CAMERA }, ASK_CAMERA);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePick != null) filePick.onReceiveValue(null);
            filePick = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                filePick = null;
                return false;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        boolean yes = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == ASK_BLUETOOTH && afterBluetooth != null) {
            Runnable next = afterBluetooth;
            afterBluetooth = null;
            next.run();
        } else if (code == ASK_CAMERA && cameraRequest != null) {
            if (yes) cameraRequest.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }); else cameraRequest.deny();
            cameraRequest = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == PICK_FILE && filePick != null) {
            filePick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            filePick = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        printing.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
