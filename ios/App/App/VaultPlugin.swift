import Foundation
import Capacitor

/**
 * The native vault: the app's own Documents folder, visible in the
 * Files app and carried by iCloud device backup. Three methods only —
 * the JS guard-brain (buildFsBridge) owns every rule about conflicts,
 * shadows and verified writes; this file just moves bytes.
 */
@objc(VaultPlugin)
public class VaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VaultPlugin"
    public let jsName = "Vault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
    ]

    private var root: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// names are vault-relative ("Journal/2026-08-27 Today.md"); never
    /// let one climb out of Documents
    private func resolve(_ name: String) -> URL? {
        if name.isEmpty || name.hasPrefix("/") { return nil }
        let url = root.appendingPathComponent(name).standardizedFileURL
        guard url.path.hasPrefix(root.standardizedFileURL.path + "/") else { return nil }
        return url
    }

    @objc func list(_ call: CAPPluginCall) {
        var out: [String] = []
        let fm = FileManager.default
        let base = root.standardizedFileURL.path
        if let walker = fm.enumerator(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) {
            for case let item as URL in walker {
                guard item.pathExtension.lowercased() == "md" else { continue }
                let rel = String(item.standardizedFileURL.path.dropFirst(base.count + 1))
                if rel.split(separator: "/").count <= 4 { out.append(rel) }
            }
        }
        call.resolve(["names": out.sorted(by: >)])
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let url = resolve(name) else {
            call.reject("bad name")
            return
        }
        guard
            let data = try? Data(contentsOf: url),
            let text = String(data: data, encoding: .utf8)
        else {
            call.resolve(["exists": false])
            return
        }
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let mtime = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        call.resolve(["exists": true, "text": text, "mtime": Int(mtime * 1000)])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard
            let name = call.getString("name"),
            let text = call.getString("text"),
            let url = resolve(name)
        else {
            call.reject("bad args")
            return
        }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Data(text.utf8).write(to: url, options: .atomic)
            call.resolve()
        } catch {
            call.reject("write failed: \(error.localizedDescription)")
        }
    }
}
