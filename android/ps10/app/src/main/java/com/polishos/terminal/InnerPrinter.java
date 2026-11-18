package com.polishos.terminal;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;

import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;

/**
 * The printer inside the handheld terminal. Android shows it as a paired old-style Bluetooth printer
 * called "InnerPrinter" at the made-up address 00:11:22:33:44:55; it takes plain ESC/POS bytes over a
 * serial (SPP) link. A web page in Chrome can't open that link, an app can.
 */
final class InnerPrinter {
    private static final String ADDRESS = "00:11:22:33:44:55";
    private static final String NAME = "InnerPrinter";
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private InnerPrinter() {}

    /** Sends the bytes. Returns null when printed, else a short reason in plain words. One print at a time. */
    @SuppressLint("MissingPermission") // the caller asks for BLUETOOTH_CONNECT first
    static synchronized String print(Context ctx, byte[] data) {
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) return "This device has no Bluetooth.";
        if (!adapter.isEnabled()) return "Turn Bluetooth on, then print again.";

        BluetoothDevice printer = null;
        try {
            for (BluetoothDevice d : adapter.getBondedDevices()) {
                if (ADDRESS.equals(d.getAddress()) || NAME.equalsIgnoreCase(d.getName())) { printer = d; break; }
            }
            if (printer == null) printer = adapter.getRemoteDevice(ADDRESS);
        } catch (SecurityException e) {
            return "Allow Nearby devices for PolishOS, then print again.";
        }

        BluetoothSocket socket = null;
        try {
            try {
                socket = printer.createRfcommSocketToServiceRecord(SPP);
                socket.connect();
            } catch (IOException first) {
                close(socket);
                socket = printer.createInsecureRfcommSocketToServiceRecord(SPP);
                socket.connect();
            }
            OutputStream out = socket.getOutputStream();
            for (int i = 0; i < data.length; i += 1024) out.write(data, i, Math.min(1024, data.length - i));
            out.flush();
            Thread.sleep(400); // let the printer take the last bytes before the link closes
            return null;
        } catch (IOException e) {
            return "Couldn't reach the built-in printer. Check it is paired as InnerPrinter in Bluetooth settings.";
        } catch (SecurityException e) {
            return "Allow Nearby devices for PolishOS, then print again.";
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } finally {
            close(socket);
        }
    }

    private static void close(BluetoothSocket s) {
        if (s != null) try { s.close(); } catch (IOException ignored) { /* already closed */ }
    }
}
