import UIKit

/// PolishOS for iPhone / iPad: the PolishOS web app in its own full-screen window, plus taking cards
/// (Tap to Pay on iPhone, or the small Stripe Reader M2 over Bluetooth). Same idea as android/ps10.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
