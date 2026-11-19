package com.polishos.terminal;

import android.app.Application;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

/** Stripe's reader kit has to hear about the app starting. */
public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        TerminalApplicationDelegate.onCreate(this);
    }
}
