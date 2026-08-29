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

    /**
     * Every file touch happens here, never on Capacitor's bridge queue.
     *
     * Capacitor runs all plugin calls for the whole app on one shared
     * serial queue, and a coordinated read of an iCloud file that has not
     * come down yet blocks for an unbounded time — so a single such read
     * on the bridge queue would freeze every other call in the app with it.
     */
    private let io = DispatchQueue(label: "page.tata.vault.io")

    /** is the content here, or only the name? */
    private enum Presence { case here, notDownloaded, unsure }

    private func presence(of url: URL) -> Presence {
        guard
            let v = try? url.resourceValues(forKeys: [
                .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey,
            ])
        else { return .unsure }
        guard v.isUbiquitousItem == true else { return .here } // an ordinary local file
        switch v.ubiquitousItemDownloadingStatus {
        case .some(.current), .some(.downloaded): return .here
        case .some(.notDownloaded): return .notDownloaded
        default: return .unsure
        }
    }

    /**
     * Ask iCloud for the file and return immediately. Waiting is what
     * freezes apps; the page will be here on a later read, and until then
     * the JS guard treats "not downloaded" as a refusal to write, which is
     * the only answer that cannot lose words.
     */
    private func beginDownload(_ url: URL) {
        try? FileManager.default.startDownloadingUbiquitousItem(at: url)
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
        io.async { self.listOnQueue(call) }
    }

    private func listOnQueue(_ call: CAPPluginCall) {
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
        io.async { self.readOnQueue(call) }
    }

    private func readOnQueue(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let url = resolve(name) else {
            call.reject("bad name", "BAD_NAME")
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
        if presence(of: url) == .notDownloaded {
            beginDownload(url) // and do not wait for it
            call.reject("still coming down from iCloud: \(name)", "ICLOUD_DOWNLOADING")
            return
        }
        guard
            let data = try? Data(contentsOf: url),
            let text = String(data: data, encoding: .utf8)
        else {
            call.reject("unreadable: \(name)", "READ_FAILED")
            return
        }
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let mtime = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        call.resolve(["exists": true, "text": text, "mtime": Int(mtime * 1000)])
    }

    @objc func write(_ call: CAPPluginCall) {
        io.async { self.writeOnQueue(call) }
    }

    private func writeOnQueue(_ call: CAPPluginCall) {
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
