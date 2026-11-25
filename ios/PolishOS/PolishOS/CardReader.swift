import Foundation
import UIKit
import StripeTerminal

/// Taking cards, the same way as android/ps10 CardReader.java:
/// - `tap` = Tap to Pay on iPhone: the client taps the card / phone wallet on the top of THIS iPhone (XS or newer).
/// - otherwise the small Stripe Reader M2 over Bluetooth.
/// The server makes the payment (amount from its copy of the ticket + the tip picked on screen) and hands us only
/// the client secret. Card details go phone/reader → Stripe; we only see "worked" or a plain-words reason.
/// `simulated` = Stripe's pretend reader / tap (test mode only).
final class CardReader: NSObject, ConnectionTokenProvider, DiscoveryDelegate, TapToPayReaderDelegate, MobileReaderDelegate {
    /// error == nil means it worked; `extra` then carries the facts (reader name, payment id…).
    typealias Done = (String?, [String: Any]?) -> Void

    private let events: ([String: Any]) -> Void
    private var asks = 0
    private var waitingTokens: [Int: ConnectionTokenCompletionBlock] = [:]
    private var scanning: Cancelable?
    private var collecting: Cancelable?
    private var busy = false
    private var payRun = 0
    private var found: (([Reader]) -> Void)?
    private static var started = false

    init(events: @escaping ([String: Any]) -> Void) {
        self.events = events
        super.init()
    }

    private func terminal() -> Terminal {
        if !Self.started {
            Terminal.initWithTokenProvider(self, delegate: nil)
            Self.started = true
        }
        return Terminal.shared
    }

    // MARK: Connection tokens: Stripe asks; we ask the web app (it is the one signed in).

    func fetchConnectionToken(_ completion: @escaping ConnectionTokenCompletionBlock) {
        DispatchQueue.main.async {
            self.asks += 1
            let ask = self.asks
            self.waitingTokens[ask] = completion
            self.events(["event": "token", "ask": ask])
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                if let late = self.waitingTokens.removeValue(forKey: ask) {
                    late(nil, Self.fail("PolishOS didn't answer. Check the internet."))
                }
            }
        }
    }

    /// The web app's answer to a "token" event.
    func token(_ ask: Int, secret: String?, error: String?) {
        guard let cb = waitingTokens.removeValue(forKey: ask) else { return }
        if let secret, !secret.isEmpty { cb(secret, nil) } else { cb(nil, Self.fail(error ?? "No connection token.")) }
    }

    private static func fail(_ text: String) -> NSError {
        NSError(domain: "PolishOS", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }

    private func say(_ text: String) {
        if !text.isEmpty { events(["event": "reader", "text": text]) }
    }

    // MARK: What can this phone do

    /// Can this iPhone take cards by itself (Tap to Pay)? {supported, reason}.
    /// Also hands the web app Apple's own Tap to Pay symbol (SF Symbol "wave.3.right.circle") as a PNG, because Apple's
    /// rules say: name it "Tap to Pay on iPhone" and use their symbol, never one we draw.
    func tapCheck(_ done: @escaping Done) {
        switch terminal().supportsReaders(of: .tapToPay, discoveryMethod: .tapToPay, simulated: false) {
        case .success:
            var o: [String: Any] = ["supported": true, "ios": true]
            if let icon = Self.tapSymbol() { o["icon"] = icon }
            done(nil, o)
        case .failure(let e): done(nil, ["supported": false, "reason": Self.reason(e), "code": Self.code(e)])
        }
    }

    private static func tapSymbol() -> String? {
        let config = UIImage.SymbolConfiguration(pointSize: 64, weight: .regular)
        guard let symbol = UIImage(systemName: "wave.3.right.circle", withConfiguration: config)?
            .withTintColor(UIColor(red: 0.086, green: 0.086, blue: 0.102, alpha: 1), renderingMode: .alwaysOriginal) else { return nil }
        let png = UIGraphicsImageRenderer(size: symbol.size).image { _ in symbol.draw(at: .zero) }.pngData()
        return png.map { "data:image/png;base64," + $0.base64EncodedString() }
    }

    /// Error answer: the plain-words reason + a short code the web app turns into English / Vietnamese.
    private static func failed(_ error: Error?, _ done: Done) { done(reason(error), ["code": code(error)]) }

    /// Is a reader connected right now?
    func status(_ done: @escaping Done) {
        if let r = terminal().connectedReader { done(nil, Self.about(r)) } else { done(nil, ["connected": false]) }
    }

    // MARK: Connect

    /// `warm` = getting Tap to Pay ready when the app opens / comes back (Apple's rule), before any ticket: never pops up
    /// Apple's terms then; those are accepted on purpose (first payment, later Settings).
    func connect(locationId: String, simulated: Bool, tap: Bool, warm: Bool = false, done: @escaping Done) {
        if busy {
            if warm { done("The reader is busy. Try again in a moment.", ["code": "busy"]); return } // warm-up: skip
            waitFree(until: Date().addingTimeInterval(60)) { [weak self] in
                self?.connect(locationId: locationId, simulated: simulated, tap: tap, warm: warm, done: done)
            }
            return
        }
        busy = true
        connectInner(locationId: locationId, simulated: simulated, tap: tap, terms: !warm) { [weak self] e, x in self?.busy = false; done(e, x) }
    }

    private static func isTap(_ r: Reader) -> Bool { r.deviceType == .tapToPay }

    private func connectInner(locationId: String, simulated: Bool, tap: Bool, terms: Bool = true, done: @escaping Done) {
        let t = terminal()
        if let now = t.connectedReader {
            if now.simulated == simulated && Self.isTap(now) == tap { done(nil, Self.about(now)); return }
            // another kind is connected (pretend vs real, M2 vs Tap to Pay): let it go first
            t.disconnectReader { error in
                if let error { Self.failed(error, done) } else { self.connectInner(locationId: locationId, simulated: simulated, tap: tap, terms: terms, done: done) }
            }
            return
        }
        say(tap ? "Getting Tap to Pay ready…" : simulated ? "Starting the practice reader…" : "Looking for the reader. Turn it on and keep it close.")
        let config: DiscoveryConfiguration
        do {
            config = tap
                ? try TapToPayDiscoveryConfigurationBuilder().setSimulated(simulated).build()
                : try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(simulated).setTimeout(25).build()
        } catch { Self.failed(error, done); return }

        var picked = false
        found = { [weak self] readers in
            guard let self, !picked, let choice = readers.first(where: { $0.deviceType == .stripeM2 }) ?? readers.first else { return }
            picked = true
            self.say(tap ? "Getting Tap to Pay ready…" : "Connecting to the reader…")
            let how: ConnectionConfiguration
            do {
                how = tap
                    ? try TapToPayConnectionConfigurationBuilder(delegate: self, locationId: locationId)
                        .setTosAcceptancePermitted(terms).setAutoReconnectOnUnexpectedDisconnect(true).build()
                    : try BluetoothConnectionConfigurationBuilder(delegate: self, locationId: locationId).setAutoReconnectOnUnexpectedDisconnect(true).build()
            } catch { Self.failed(error, done); return }
            t.connectReader(choice, connectionConfig: how) { reader, error in
                if let reader { done(nil, Self.about(reader)) } else { Self.failed(error, done) }
            }
        }
        scanning = t.discoverReaders(config, delegate: self) { error in
            if picked { return } // the scan ends when we connect: not a failure
            if let error { Self.failed(error, done) }
            else { done(tap ? "Tap to Pay didn't start on this phone. Try again." : "No reader found. Turn the reader on, keep it close, then try again.", ["code": tap ? "tap_start" : "no_reader"]) }
        }
    }

    func terminal(_ terminal: Terminal, didUpdateDiscoveredReaders readers: [Reader]) {
        found?(readers)
    }

    // MARK: Pay

    /// Take the card for one payment (made by the server). Connects first when needed.
    /// `terms` false (iPhone app 1.3+, web sends it) = never show Apple's Tap to Pay terms at checkout: an owner or
    /// manager accepts them once in Settings → Tap to Pay on iPhone (Apple's rule). Older pages don't send it = true.
    func pay(secret: String, locationId: String, simulated: Bool, tap: Bool, terms: Bool = true, done: @escaping Done) {
        if busy {
            // Still busy (getting ready in the background, or an older try the page left open): end the older try,
            // wait until the reader is free (up to 60 s), then take this payment. Never a dead "try again" loop.
            cancel { _, _ in }
            waitFree(until: Date().addingTimeInterval(60)) { [weak self] in
                self?.pay(secret: secret, locationId: locationId, simulated: simulated, tap: tap, terms: terms, done: done)
            }
            return
        }
        busy = true
        payRun += 1
        let run = payRun
        var ended = false
        let finish: Done = { [weak self] e, x in
            guard !ended else { return }
            ended = true
            self?.busy = false; self?.collecting = nil; done(e, x)
        }
        if simulated {
            // Stripe's practice tap pays by itself in a few seconds. If it hasn't after 30 s, stop it so the reader
            // is free again (and say so) instead of spinning forever.
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
                guard let self, self.payRun == run, !ended else { return }
                self.cancel { _, _ in }
                finish("The practice tap didn't answer. Try again.", ["code": "practice_stuck"])
            }
        }
        connectInner(locationId: locationId, simulated: simulated, tap: tap, terms: terms) { error, _ in
            if let error { finish(error, nil); return }
            let t = Terminal.shared
            t.retrievePaymentIntent(clientSecret: secret) { intent, error in
                guard let intent else { Self.failed(error, finish); return }
                // The tip was picked on screen and is already in the amount.
                let config = try? CollectPaymentIntentConfigurationBuilder().setSkipTipping(true).build()
                if tap { self.say("Hold the card or phone wallet near the top of this iPhone.") }
                self.collecting = t.collectPaymentMethod(intent, collectConfig: config) { collected, error in
                    guard let collected else { Self.failed(error, finish); return }
                    self.say("Checking the card…")
                    t.confirmPaymentIntent(collected) { paid, error in
                        guard let paid else { Self.failed(error, finish); return }
                        finish(nil, ["paymentIntent": paid.stripeId ?? "", "status": String(describing: paid.status)])
                    }
                }
            }
        }
    }

    /// Run `go` once the reader is free. Past `until`, the stuck try is dropped (reader disconnected) so the app
    /// never stays "busy" until it is restarted.
    private func waitFree(until: Date, _ go: @escaping () -> Void) {
        if !busy { go(); return }
        if Date() > until {
            busy = false; collecting = nil; scanning = nil
            if terminal().connectedReader != nil { terminal().disconnectReader { _ in go() } } else { go() }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.waitFree(until: until, go) }
    }

    /// Stop waiting for the card / stop looking for a reader. The waiting payment ends with "canceled".
    func cancel(_ done: @escaping Done) {
        let c = [collecting, scanning].compactMap { $0 }.first { !$0.completed }
        guard let c else { done(nil, nil); return }
        c.cancel { error in done(error.map { Self.reason($0) }, nil) }
    }

    func disconnect(_ done: @escaping Done) {
        let t = terminal()
        guard t.connectedReader != nil else { done(nil, nil); return }
        t.disconnectReader { error in done(error.map { Self.reason($0) }, nil) }
    }

    // MARK: What the reader / Tap to Pay wants shown

    func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) { say("Getting Tap to Pay ready (first time takes a minute)…") }
    func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) { say("Getting Tap to Pay ready: \(Int(progress * 100))%") }
    func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
    func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions) { say("Hold the card or phone wallet near the top of this iPhone.") }
    func tapToPayReader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) { say(Terminal.stringFromReaderDisplayMessage(displayMessage)) }

    func reader(_ reader: Reader, didReportAvailableUpdate update: ReaderSoftwareUpdate) {}
    func reader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) { say("Updating the reader. Keep it on and close. This can take a few minutes.") }
    func reader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) { say("Updating the reader: \(Int(progress * 100))%") }
    func reader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
    func reader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions) { say("Tap, insert or swipe the card on the reader.") }
    func reader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) { say(Terminal.stringFromReaderDisplayMessage(displayMessage)) }
    func readerDidReportLowBatteryWarning(_ reader: Reader) { say("The reader's battery is low. Charge it soon.") }

    // MARK: Plain words

    private static func about(_ r: Reader) -> [String: Any] {
        var o: [String: Any] = [
            "connected": true,
            "name": r.deviceType == .stripeM2 ? "Stripe Reader M2" : isTap(r) ? "Tap to Pay on this iPhone" : Terminal.stringFromDeviceType(r.deviceType),
            "serial": r.serialNumber,
            "simulated": r.simulated,
            "tap": isTap(r),
        ]
        if let b = r.batteryLevel { o["battery"] = Int((b.floatValue * 100).rounded()) }
        return o
    }

    /// A short code for the web app's own words (EN + VI): src/lib/app/reader.ts `TAP_ERRORS`.
    private static func code(_ error: Error?) -> String {
        guard let e = error as NSError? else { return "unknown" }
        if e.domain == NSURLErrorDomain { return "offline" }
        guard e.domain == ErrorDomain else { return "unknown" }
        switch e.code {
        case 2020: return "canceled"
        case 2200: return "location"
        case 2320: return "bluetooth"
        case 2910: return "unsupported"
        case 2920: return "passcode"
        case 2930: return "call"
        case 2960: return "icloud"
        case 2970, 3930: return "terms"
        case 3920: return "blocked"
        case 3950, 3960, 3970: return "account"
        case 6000, 6500: return "declined"
        case 9000...9999: return "offline"
        default: return "unknown"
        }
    }

    /// A short reason in plain words. "canceled" is a word the web app looks for.
    private static func reason(_ error: Error?) -> String {
        guard let e = error as NSError? else { return "Something went wrong. Try again." }
        guard e.domain == ErrorDomain else { return e.localizedDescription }
        switch e.code {
        case 2020: return "canceled"
        case 2200: return "Turn on Location for PolishOS (Settings → PolishOS → Location), then try again."
        case 2320: return "Turn on Bluetooth, then try again."
        case 2910: return "This iPhone can't take cards by tap. It needs an iPhone XS or newer on the latest iOS."
        case 2920: return "Set a passcode on this iPhone (Settings → Face ID & Passcode), then try again."
        case 2930: return "Finish the phone call first, then try again."
        case 2960: return "Sign in to iCloud on this iPhone (Settings → your name) to turn on Tap to Pay, then try again."
        case 2970, 3930: return "Tap to Pay needs the owner to accept Apple's terms once. Try again and tap Accept."
        case 3920: return "Apple has blocked this iPhone from taking cards by tap. Use another phone or the card reader."
        case 3950, 3960, 3970: return "Apple can't turn on Tap to Pay for this salon yet. Contact PolishOS support."
        case 6000, 6500: return "Card declined. \(e.localizedDescription)"
        default: return e.localizedDescription
        }
    }
}
