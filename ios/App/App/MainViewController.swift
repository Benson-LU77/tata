import UIKit
import Capacitor

/// The storyboard points here so the in-app Vault plugin gets registered —
/// Capacitor only auto-discovers packaged plugins, not app-local ones.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VaultPlugin())
    }
}
