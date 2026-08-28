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
        // standardizing collapses "..", but it does not follow symlinks, and
        // on iOS /var is a link to /private/var — compare resolved paths, and
        // refuse the climb explicitly rather than trusting the collapse
        if name.split(separator: "/").contains("..") { return nil }
        let url = root.appendingPathComponent(name).standardizedFileURL
        let inside = url.resolvingSymlinksInPath().path
        let top = root.resolvingSymlinksInPath().path
        guard inside.hasPrefix(top + "/") else { return nil }
        return url
    }

    @objc func list(_ call: CAPPluginCall) {
        var out: [String] = []
        let fm = FileManager.default
        let base = root.standardizedFileURL.path
        // A vault we could not open is not an empty vault. Returning [] here
        // would read as "every page is gone": the city empties, the panel
        // still says connected, and every write becomes a free write onto a
        // name the guard believes is unused.
        guard let walker = fm.enumerator(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            call.reject("cannot read the vault folder")
            return
        }
        for case let item as URL in walker {
            guard item.pathExtension.lowercased() == "md" else { continue }
            let rel = String(item.standardizedFileURL.path.dropFirst(base.count + 1))
            // depth 3, the same ceiling every other bridge walks to — one
            // vault must not show different pages through different roads
            if rel.split(separator: "/").count <= 3 {
                out.append(rel.precomposedStringWithCanonicalMapping)
            }
        }
        call.resolve(["names": out.sorted(by: >)])
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let url = resolve(name) else {
            call.reject("bad name")
            return
        }
        // "absent" and "unreadable" are different answers. Only a file the
        // system says is not there may be reported absent — everything else
        // (a page still coming down from iCloud, a lapsed folder grant, a
        // bad byte) is rejected, so the JS guard refuses the write and keeps
        // the draft instead of replacing words it never managed to see.
        if !FileManager.default.fileExists(atPath: url.path) {
            call.resolve(["exists": false])
            return
        }
        guard
            let data = try? Data(contentsOf: url),
            let text = String(data: data, encoding: .utf8)
        else {
            call.reject("unreadable: \(name)")
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
