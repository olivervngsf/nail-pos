# Only drop code nothing uses (the card reader kit is large). No renaming, no rewriting: what stays runs as written.
-dontobfuscate
-dontoptimize
-keep class com.polishos.terminal.** { *; }
