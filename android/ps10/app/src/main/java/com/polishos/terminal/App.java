package com.polishos.terminal;

import android.app.Application;

import com.stripe.stripeterminal.TerminalApplicationDelegate;
import com.stripe.stripeterminal.taptopay.TapToPay;

/** Stripe's reader kit has to hear about the app starting. */
public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Tap to Pay runs Stripe's card screen in a second process of this app: nothing of ours starts there.
        if (TapToPay.Companion.isInTapToPayProcess()) return;
        TerminalApplicationDelegate.onCreate(this);
    }
}
