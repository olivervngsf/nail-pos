# Only drop code nothing uses (the card reader kit is large). No renaming, no rewriting: what stays runs as written.
-dontobfuscate
-dontoptimize
-keep class com.polishos.terminal.** { *; }
# Tap to Pay: Stripe's contactless kit runs in its own process and loads parts by name; keep it whole.
-keep class com.stripe.cots.** { *; }
-keep class com.stripe.stripeterminal.taptopay.** { *; }
