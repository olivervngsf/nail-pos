import UIKit
import WebKit
import ProximityReader

/// The PolishOS web app in a full-screen window. Pages from polishosapp.com (only) get `window.PolishOSApp`,
/// the same bridge the Android app offers (src/lib/app/bridge.ts): the page sends JSON with an "id", we answer
/// {"id","ok":true,…} or {"id","error":"…"}, and we can tell it things by ourselves: {"event":"…",…}.
final class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private static let home = URL(string: "https://polishosapp.com/")!
    /** Only these pages get the bridge. */
    private static let trusted: Set<String> = ["polishosapp.com", "www.polishosapp.com"]

    private var web: WKWebView!
    private lazy var reader = CardReader { [weak self] event in self?.send(event) }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()   // sign-in + the offline outbox live here
        // "PolishOSApp/1.4" = the app version the web app reads; "PolishOS-iOS" = no built-in printer here.
        config.applicationNameForUserAgent = "Mobile/15E148 Safari/604.1 PolishOSApp/1.4 PolishOS-iOS"

        let bridge = """
        (function () {
          if (!/^(www\\.)?polishosapp\\.com$/.test(location.hostname)) return;
          window.PolishOSApp = {
            onmessage: null,
            postMessage: function (s) { window.webkit.messageHandlers.polishos.postMessage(String(s)); }
          };
        })();
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "polishos")

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { web.isInspectable = false }
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: Self.home))
        // Back on screen: the web app gets Tap to Pay ready again (Apple: prepare on open + on coming back).
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.send(["event": "foreground"])
        }
    }

    // MARK: Messages from the web app

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, Self.trusted.contains(message.frameInfo.securityOrigin.host),
              let text = message.body as? String,
              let data = text.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        let id = msg["id"] as? String ?? ""
        let done: CardReader.Done = { [weak self] error, extra in self?.answer(id, error, extra) }

        if msg["print"] != nil { done("Printing from the iPhone app isn't ready yet.", nil); return }
        if let ask = msg["tokenFor"] as? Int { reader.token(ask, secret: msg["secret"] as? String, error: msg["error"] as? String); return }
        let location = (msg["locationId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let simulated = msg["simulated"] as? Bool ?? false
        let tap = msg["tap"] as? Bool ?? false

        if let secret = msg["pay"] as? String {
            guard !secret.isEmpty, let location else { done("Can't start the card payment.", nil); return }
            reader.pay(secret: secret, locationId: location, simulated: simulated, tap: tap, terms: msg["terms"] as? Bool ?? true, done: done)
            return
        }
        switch msg["reader"] as? String {
        case nil: done(nil, nil) // "are you there?"
        case "connect":
            guard let location else { done("Can't find the salon's reader location.", nil); return }
            reader.connect(locationId: location, simulated: simulated, tap: tap, warm: msg["warm"] as? Bool ?? false, done: done)
        case "disconnect": reader.disconnect(done)
        case "cancel": reader.cancel(done)
        case "tapCheck": reader.tapCheck { error, extra in
            // + whether Apple's own "how to tap" screens can be shown here (iOS 18+).
            var x = extra ?? [:]
            if #available(iOS 18.0, *) { x["howTo"] = true } else { x["howTo"] = false }
            done(error, x)
        }
        case "howToTap": showHowToTap(done)
        default: reader.status(done)
        }
    }

    /// Apple's own merchant education ("how to tap") screens, required for Tap to Pay on iPhone (iOS 18+:
    /// ProximityReaderDiscovery). Older iOS answers code "old_ios" and the web app shows its own short help.
    private func showHowToTap(_ done: @escaping CardReader.Done) {
        guard #available(iOS 18.0, *) else { done("Apple's how-to screens need iOS 18 or newer.", ["code": "old_ios"]); return }
        Task { @MainActor in
            do {
                let discovery = ProximityReaderDiscovery()
                let content = try await discovery.content(for: .payment(.howToTap))
                try await discovery.presentContent(content, from: self)
                done(nil, nil)
            } catch {
                done(error.localizedDescription, ["code": "howto_failed"])
            }
        }
    }

    private func answer(_ id: String, _ error: String?, _ extra: [String: Any]?) {
        var out = extra ?? [:]
        out["id"] = id
        if let error { out["error"] = error } else { out["ok"] = true }
        send(out)
    }

    /// Hand one JSON message to the page's `PolishOSApp.onmessage({data})`.
    private func send(_ object: [String: Any]) {
        guard let json = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: json, encoding: .utf8),
              let literal = try? JSONEncoder().encode(text), let quoted = String(data: literal, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.web.url?.host, Self.trusted.contains(host) else { return }
            self.web.evaluateJavaScript("window.PolishOSApp && window.PolishOSApp.onmessage && window.PolishOSApp.onmessage({data: \(quoted)})")
        }
    }

    // MARK: Pages: web links stay inside; phone, text, mail and app links open their own app.

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { decisionHandler(.cancel); return }
        if scheme == "https" || scheme == "http" || scheme == "about" || scheme == "blob" || scheme == "data" { decisionHandler(.allow); return }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    /// target=_blank links (receipts, Stripe pages): open in this same window.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil { webView.load(action.request) }
        return nil
    }

    /// Camera for slip scans: the page already asked; don't ask twice.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(Self.trusted.contains(origin.host) ? .grant : .prompt)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        // No internet when the page was opening: a plain screen with one button.
        let retry = (webView.url ?? Self.home).absoluteString
            .replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "<", with: "&lt;")
        let html = """
        <html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>
        <body style='font-family:-apple-system,sans-serif;text-align:center;padding:72px 24px;color:#16161A'>
        <h2>No internet</h2><p style='color:#5E5E66'>Check the Wi-Fi, then try again.</p>
        <p><a href="\(retry)" style='display:inline-block;margin-top:16px;padding:14px 28px;border-radius:12px;background:#16161A;color:#fff;text-decoration:none;font-weight:600'>Try again</a></p>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // JS alert/confirm from the web app (e.g. "Sign out?").
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }
}
