import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var privacyCover: UIView?
    private func webView(in view: UIView?) -> WKWebView? {
        if let web = view as? WKWebView { return web }
        for child in view?.subviews ?? [] { if let web = webView(in: child) { return web } }
        return nil
    }
    private func cover() {
        guard privacyCover == nil, let window = window else { return }
        let panel = UIView(frame: window.bounds)
        panel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        panel.backgroundColor = UIColor(red: 0.09, green: 0.098, blue: 0.118, alpha: 1)
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        panel.addSubview(stack)
        let display = UILabel()
        display.text = "0"
        display.textColor = .white
        display.textAlignment = .right
        display.font = .systemFont(ofSize: 64, weight: .light)
        stack.addArrangedSubview(display)
        let keys = [["AC", "±", "%", "÷"], ["7", "8", "9", "×"], ["4", "5", "6", "−"], ["1", "2", "3", "+"], ["⌫", "0", ".", "＝"]]
        for rowKeys in keys {
            let row = UIStackView()
            row.distribution = .fillEqually
            row.spacing = 12
            for (index, key) in rowKeys.enumerated() {
                let label = UILabel()
                label.text = key
                label.textAlignment = .center
                label.textColor = .white
                label.font = .systemFont(ofSize: 30)
                label.backgroundColor = index == 3 ? .systemOrange : UIColor(white: 0.2, alpha: 1)
                label.layer.cornerRadius = 25
                label.clipsToBounds = true
                row.addArrangedSubview(label)
            }
            row.heightAnchor.constraint(equalToConstant: min(82, window.bounds.height * 0.1)).isActive = true
            stack.addArrangedSubview(row)
        }
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: panel.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: panel.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: panel.safeAreaLayoutGuide.bottomAnchor, constant: -24)
        ])
        window.addSubview(panel)
        privacyCover = panel
    }


    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        cover()

    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Permission sheets resign activity without entering background.
        // Do not interrupt QR scanning when the camera permission is shown.
        webView(in: window?.rootViewController?.view)?.evaluateJavaScript("window.dispatchEvent(new Event('calculator-native-background'))", completionHandler: nil)
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        guard privacyCover != nil else { return }
        webView(in: window?.rootViewController?.view)?.evaluateJavaScript("window.dispatchEvent(new Event('calculator-native-resume'))") { [weak self] _, error in
            guard error == nil else { return }
            self?.privacyCover?.removeFromSuperview()
            self?.privacyCover = nil
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}


@objc(NativeClipboardPlugin)
public class NativeClipboardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeClipboardPlugin"
    public let jsName = "NativeClipboard"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "writeText", returnType: CAPPluginReturnPromise)]

    @objc func writeText(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else { call.reject("缺少待复制文本"); return }
        DispatchQueue.main.async {
            UIPasteboard.general.string = text
            call.resolve(["verified": UIPasteboard.general.string == text])
        }
    }
}

class CalculatorBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeClipboardPlugin())
    }
}
