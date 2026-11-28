import UIKit

/// PolishOS for iPhone / iPad: the PolishOS web app in its own full-screen window, plus taking cards
/// (Tap to Pay on iPhone, or the small Stripe Reader M2 over Bluetooth). Same idea as android/ps10.
///
/// Apps built with the iOS 27 SDK must use the scene life cycle or iOS stops them at launch
/// (Nov 28: the first Xcode 27 TestFlight build crashed on open). The window lives in SceneDelegate.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
