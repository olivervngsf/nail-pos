package com.polishos.terminal;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.stripe.stripeterminal.Terminal;
import com.stripe.stripeterminal.external.callable.Callback;
import com.stripe.stripeterminal.external.callable.Cancelable;
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback;
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider;
import com.stripe.stripeterminal.external.callable.DiscoveryListener;
import com.stripe.stripeterminal.external.callable.MobileReaderListener;
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback;
import com.stripe.stripeterminal.external.callable.ReaderCallback;
import com.stripe.stripeterminal.external.callable.TerminalListener;
import com.stripe.stripeterminal.external.models.CollectPaymentIntentConfiguration;
import com.stripe.stripeterminal.external.models.ConnectionConfiguration;
import com.stripe.stripeterminal.external.models.ConnectionTokenException;
import com.stripe.stripeterminal.external.models.DeviceType;
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration;
import com.stripe.stripeterminal.external.models.PaymentIntent;
import com.stripe.stripeterminal.external.models.Reader;
import com.stripe.stripeterminal.external.models.ReaderDisplayMessage;
import com.stripe.stripeterminal.external.models.ReaderInputOptions;
import com.stripe.stripeterminal.external.models.ReaderSoftwareUpdate;
import com.stripe.stripeterminal.external.models.TerminalErrorCode;
import com.stripe.stripeterminal.external.models.TerminalException;
import com.stripe.stripeterminal.log.LogLevel;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The small card reader (Stripe Reader M2) next to the terminal: find it over Bluetooth, connect, take one payment.
 * The web app decides the amount on the server and hands us only the payment's client secret; card data never
 * passes through this app (it goes reader → Stripe, encrypted).
 *
 * `simulated` = Stripe's pretend reader (test mode only): the whole flow with no hardware.
 */
final class CardReader {
    /** Things we tell the web app without being asked: "token" (we need a connection token), "reader" (what to show). */
    interface Events { void send(JSONObject event); }
    /** error == null means it worked; `extra` then carries the facts (reader name, payment id…). */
    interface Done { void done(String error, JSONObject extra); }

    private static final int SCAN_SECONDS = 25;
    private static final long TOKEN_WAIT_MS = 20_000;

    private final Context app;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger asks = new AtomicInteger();
    private final Map<Integer, ConnectionTokenCallback> waitingTokens = new ConcurrentHashMap<>();

    private Cancelable scanning;    // looking for a reader
    private Cancelable collecting;  // waiting for the card
    private boolean busy;           // one connect / payment at a time

    CardReader(Context app, Events events) {
        this.app = app.getApplicationContext();
        this.events = events;
    }

    // ── Stripe asks for a connection token whenever it needs one: we ask the web app (it is the one signed in).
    private final ConnectionTokenProvider tokens = callback -> {
        final int ask = asks.incrementAndGet();
        waitingTokens.put(ask, callback);
        event("token", "ask", ask);
        main.postDelayed(() -> {
            ConnectionTokenCallback late = waitingTokens.remove(ask);
            if (late != null) late.onFailure(new ConnectionTokenException("PolishOS didn't answer. Check the internet."));
        }, TOKEN_WAIT_MS);
    };

    /** The web app's answer to a "token" event. */
    void token(int ask, String secret, String error) {
        ConnectionTokenCallback cb = waitingTokens.remove(ask);
        if (cb == null) return;
        if (secret != null && !secret.isEmpty()) cb.onSuccess(secret);
        else cb.onFailure(new ConnectionTokenException(error == null ? "No connection token." : error));
    }

    private Terminal terminal() throws TerminalException {
        if (!Terminal.isInitialized()) Terminal.init(app, LogLevel.NONE, tokens, new TerminalListener() { }, null);
        return Terminal.getInstance();
    }

    // ── What the reader wants shown while a card is being taken / an update runs.
    private final MobileReaderListener listener = new MobileReaderListener() {
        @Override public void onRequestReaderInput(ReaderInputOptions options) { event("reader", "text", "Tap, insert or swipe the card on the reader."); }
        @Override public void onRequestReaderDisplayMessage(ReaderDisplayMessage message) { event("reader", "text", words(message)); }
        @Override public void onStartInstallingUpdate(ReaderSoftwareUpdate update, Cancelable cancelable) { event("reader", "text", "Updating the reader. Keep it on and close. This can take a few minutes."); }
        @Override public void onReportReaderSoftwareUpdateProgress(float progress) { event("reader", "text", "Updating the reader: " + Math.round(progress * 100) + "%"); }
        @Override public void onReportLowBatteryWarning() { event("reader", "text", "The reader's battery is low. Charge it soon."); }
    };

    private static String words(ReaderDisplayMessage m) {
        switch (m) {
            case RETRY_CARD: return "Try the card again.";
            case INSERT_CARD: return "Insert the card (chip side in).";
            case INSERT_OR_SWIPE_CARD: return "Insert or swipe the card.";
            case SWIPE_CARD: return "Swipe the card.";
            case REMOVE_CARD: return "Take the card out.";
            case MULTIPLE_CONTACTLESS_CARDS_DETECTED: return "Hold just one card to the reader.";
            case TRY_ANOTHER_READ_METHOD: return "Try another way: tap, insert or swipe.";
            case TRY_ANOTHER_CARD: return "Try another card.";
            case CARD_REMOVED_TOO_EARLY: return "Card taken out too soon. Try again.";
            case CHECK_MOBILE_DEVICE: return "Check the phone (wallet) to finish.";
            default: return "";
        }
    }

    /** Is a reader connected right now? */
    void status(Done done) {
        try {
            Reader r = terminal().getConnectedReader();
            done.done(null, r == null ? put(new JSONObject(), "connected", false) : about(r));
        } catch (TerminalException e) {
            done.done(reason(e), null);
        }
    }

    /** Find a reader near the terminal and connect it. Already connected (same kind) = nothing to do. */
    void connect(String locationId, boolean simulated, Done done) {
        if (busy) { done.done("The reader is busy. Try again in a moment.", null); return; }
        busy = true;
        connectInner(locationId, simulated, (error, extra) -> { busy = false; done.done(error, extra); });
    }

    private void connectInner(String locationId, boolean simulated, Done done) {
        final Terminal t;
        try { t = terminal(); } catch (TerminalException e) { done.done(reason(e), null); return; }
        Reader now = t.getConnectedReader();
        if (now != null && now.isSimulated() == simulated) { done.done(null, about(now)); return; }
        if (now != null) { // a pretend reader is connected but the real one is wanted (or the other way round)
            t.disconnectReader(new Callback() {
                @Override public void onSuccess() { connectInner(locationId, simulated, done); }
                @Override public void onFailure(TerminalException e) { done.done(reason(e), null); }
            });
            return;
        }
        event("reader", "text", simulated ? "Starting the practice reader…" : "Looking for the reader. Turn it on and keep it close.");
        final boolean[] picked = { false };
        scanning = t.discoverReaders(new DiscoveryConfiguration.BluetoothDiscoveryConfiguration(SCAN_SECONDS, simulated),
            (DiscoveryListener) readers -> {
                Reader choice = choose(readers);
                if (choice == null || picked[0]) return;
                picked[0] = true;
                event("reader", "text", "Connecting to the reader…");
                t.connectReader(choice, new ConnectionConfiguration.BluetoothConnectionConfiguration(locationId, true, listener), new ReaderCallback() {
                    @Override public void onSuccess(Reader reader) { done.done(null, about(reader)); }
                    @Override public void onFailure(TerminalException e) { done.done(reason(e), null); }
                });
            },
            new Callback() {
                @Override public void onSuccess() { if (!picked[0]) done.done("No reader found. Turn the reader on, keep it close, then try again.", null); }
                @Override public void onFailure(TerminalException e) {
                    if (picked[0]) return; // the scan ends when we connect: not a failure
                    done.done(e.getErrorCode() == TerminalErrorCode.BLUETOOTH_SCAN_TIMED_OUT
                        ? "No reader found. Turn the reader on, keep it close, then try again." : reason(e), null);
                }
            });
    }

    /** The M2 if there is one, else the first reader seen. */
    private static Reader choose(List<Reader> readers) {
        if (readers == null || readers.isEmpty()) return null;
        for (Reader r : readers) if (r.getDeviceType() == DeviceType.STRIPE_M2) return r;
        return readers.get(0);
    }

    /** Take the card for one payment (made by the server). Connects the reader first when needed. */
    void pay(String clientSecret, String locationId, boolean simulated, Done done) {
        if (busy) { // an older try is still open (e.g. the page was reloaded): end it so the next tap works
            cancel((error, extra) -> { });
            done.done("The reader was finishing the last try. Try again.", null);
            return;
        }
        busy = true;
        final Done finish = (error, extra) -> { busy = false; collecting = null; done.done(error, extra); };
        connectInner(locationId, simulated, (error, reader) -> {
            if (error != null) { finish.done(error, null); return; }
            final Terminal t;
            try { t = terminal(); } catch (TerminalException e) { finish.done(reason(e), null); return; }
            t.retrievePaymentIntent(clientSecret, new PaymentIntentCallback() {
                @Override public void onSuccess(PaymentIntent intent) {
                    // The tip was picked on the terminal's screen and is already in the amount.
                    CollectPaymentIntentConfiguration config = new CollectPaymentIntentConfiguration.Builder().skipTipping(true).build();
                    collecting = t.collectPaymentMethod(intent, new PaymentIntentCallback() {
                        @Override public void onSuccess(PaymentIntent collected) {
                            event("reader", "text", "Checking the card…");
                            t.confirmPaymentIntent(collected, new PaymentIntentCallback() {
                                @Override public void onSuccess(PaymentIntent paid) {
                                    JSONObject extra = put(new JSONObject(), "paymentIntent", paid.getId());
                                    finish.done(null, put(extra, "status", String.valueOf(paid.getStatus())));
                                }
                                @Override public void onFailure(TerminalException e) { finish.done(reason(e), null); }
                            });
                        }
                        @Override public void onFailure(TerminalException e) { finish.done(reason(e), null); }
                    }, config);
                }
                @Override public void onFailure(TerminalException e) { finish.done(reason(e), null); }
            });
        });
    }

    /** Stop waiting for the card / stop looking for a reader. The payment that was waiting ends with "canceled". */
    void cancel(Done done) {
        Cancelable c = collecting != null && !collecting.isCompleted() ? collecting : scanning != null && !scanning.isCompleted() ? scanning : null;
        if (c == null) { done.done(null, null); return; }
        c.cancel(new Callback() {
            @Override public void onSuccess() { done.done(null, null); }
            @Override public void onFailure(TerminalException e) { done.done(reason(e), null); }
        });
    }

    /** Let go of the reader (e.g. to pair another one). */
    void disconnect(Done done) {
        try {
            Terminal t = terminal();
            if (t.getConnectedReader() == null) { done.done(null, null); return; }
            t.disconnectReader(new Callback() {
                @Override public void onSuccess() { done.done(null, null); }
                @Override public void onFailure(TerminalException e) { done.done(reason(e), null); }
            });
        } catch (TerminalException e) {
            done.done(reason(e), null);
        }
    }

    private static JSONObject about(Reader r) {
        JSONObject o = put(new JSONObject(), "connected", true);
        put(o, "name", r.getDeviceType() == DeviceType.STRIPE_M2 ? "Stripe Reader M2" : String.valueOf(r.getDeviceType()));
        put(o, "serial", r.getSerialNumber());
        put(o, "simulated", r.isSimulated());
        if (r.getBatteryLevel() != null) put(o, "battery", Math.round(r.getBatteryLevel() * 100));
        return o;
    }

    /** A short reason in plain words. "canceled" is a word the web app looks for. */
    private static String reason(TerminalException e) {
        TerminalErrorCode code = e.getErrorCode();
        if (code == TerminalErrorCode.CANCELED) return "canceled";
        if (code == TerminalErrorCode.LOCATION_SERVICES_DISABLED) return "Turn on Location on this device (swipe down from the top), then try again.";
        if (code == TerminalErrorCode.BLUETOOTH_PERMISSION_DENIED) return "Allow Nearby devices for PolishOS, then try again.";
        if (code == TerminalErrorCode.BLUETOOTH_ERROR || code == TerminalErrorCode.BLUETOOTH_DISCONNECTED) return "Lost the reader. Check it is on and close, then try again.";
        if (code == TerminalErrorCode.DECLINED_BY_STRIPE_API || code == TerminalErrorCode.DECLINED_BY_READER) return "Card declined. " + e.getErrorMessage();
        return e.getErrorMessage();
    }

    private void event(String name, String key, Object value) {
        events.send(put(put(new JSONObject(), "event", name), key, value));
    }

    private static JSONObject put(JSONObject o, String key, Object value) {
        try { o.put(key, value); } catch (JSONException ignored) { /* plain keys and values only */ }
        return o;
    }
}
