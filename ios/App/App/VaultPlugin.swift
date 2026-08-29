import Foundation
import UIKit
import UniformTypeIdentifiers
import Capacitor

/**
 * The native vault. By default the app's own Documents folder — visible
 * in the Files app, carried by device backup. If the writer points us at
 * a folder of their own (an iCloud Drive folder, an Obsidian vault), the
 * pages live there instead and Apple's own sync carries them between
 * devices; Tata never operates a server.
 *
 * The JS guard-brain (buildFsBridge) owns every rule about conflicts,
 * shadows and verified writes. This file only moves bytes — and is very
 * careful about the difference between "absent", "not downloaded yet"
 * and "I could not look".
 */
@objc(VaultPlugin)
public class VaultPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate,
    UIAdaptivePresentationControllerDelegate {
    public let identifier = "VaultPlugin"
    public let jsName = "Vault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetFolder", returnType: CAPPluginReturnPromise),
    ]

    private static let bookmarkKey = "tata.vault.bookmark"
    private static let displayKey = "tata.vault.display"

    /** the chosen folder, held open for the whole process once opened */
    private var folder: URL?
    private var holdingScope = false
    /** the one in-flight picker call — main thread only */
    private var pickCall: CAPPluginCall?

    private var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /** the chosen folder if we hold one, otherwise our own Documents */
    private var root: URL { folder ?? documents }

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
    /**
     * An iCloud page whose bytes are not here yet exists on disk as a
     * hidden stub beside where it belongs: ".Aug 28 Today.md.icloud".
     * Anything asking "is this page here?" has to know that name too.
     */
    private func placeholder(for url: URL) -> URL {
        url.deletingLastPathComponent()
            .appendingPathComponent("." + url.lastPathComponent + ".icloud")
    }

    private func resolve(_ raw: String) -> URL? {
        // list() hands out NFC; take it back the same way, so a vault synced
        // from an older Mac cannot hand us a name we then fail to find
        let name = raw.precomposedStringWithCanonicalMapping
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
        // Hidden files are NOT skipped wholesale: an iCloud page that has
        // not come down yet is a hidden stub, and skipping it would make a
        // page written on the desktop simply invisible here — which reads
        // as "does not exist", which reads as "free to overwrite".
        guard let walker = fm.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: []
        ) else {
            call.reject("cannot read the vault folder")
            return
        }
        for case let item as URL in walker {
            let leaf = item.lastPathComponent
            let isDir = (try? item.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            var real = leaf
            if leaf.hasPrefix(".") {
                if leaf.hasSuffix(".icloud") {
                    real = String(leaf.dropFirst().dropLast(".icloud".count))
                } else {
                    // .obsidian, .git, .trash — do not even walk into them
                    if isDir { walker.skipDescendants() }
                    continue
                }
            }
            guard !isDir, real.lowercased().hasSuffix(".md") else { continue }
            let parent = item.deletingLastPathComponent().standardizedFileURL.path
            let dir = parent.count > base.count ? String(parent.dropFirst(base.count + 1)) + "/" : ""
            let rel = dir + real
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
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) {
            // only a stub? then the page exists — it is just still in the air
            if fm.fileExists(atPath: placeholder(for: url).path) {
                beginDownload(url)
                call.reject("still coming down from iCloud: \(name)", "ICLOUD_DOWNLOADING")
                return
            }
            call.resolve(["exists": false])
            return
        }
        if presence(of: url) == .notDownloaded {
            beginDownload(url) // outside any coordinator: coordinating here
            call.reject("still coming down from iCloud: \(name)", "ICLOUD_DOWNLOADING")
            return           // would wait on the very download it triggers
        }
        var readData: Data?
        var coordErr: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordErr) { at in
            readData = try? Data(contentsOf: at)
        }
        guard
            coordErr == nil,
            let data = readData,
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
        } catch {
            call.reject("write failed: \(error.localizedDescription)", "WRITE_FAILED")
            return
        }
        /*
         * In place, and deliberately NOT atomic.
         *
         * An atomic write is a temp file and a rename, which inside someone
         * else's vault reads as delete-then-create: Obsidian may close the
         * tab they had open, and iCloud may treat it as a brand new file and
         * drop its version history. A page is worth more than the small risk
         * of a torn write, which the shadow copy and the read-back check on
         * the JS side already cover.
         *
         * Nothing inside this block may coordinate again or ask iCloud for a
         * download — either would wait on the coordinator that is holding it.
         */
        var failure: Error?
        var coordErr: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: [], error: &coordErr) { at in
            do { try Data(text.utf8).write(to: at) } catch { failure = error }
        }
        if let err = coordErr ?? failure {
            call.reject("write failed: \(err.localizedDescription)", "WRITE_FAILED")
            return
        }
        call.resolve()
    }

    // MARK: - choosing a folder of one's own

    /**
     * Restore the remembered folder. Called once at load, and retried with
     * backoff: right after a reboot the file provider may not be up yet,
     * and a bookmark that fails at that moment is not a bookmark that is
     * broken. We never throw one away on failure — only the writer does,
     * by choosing again or by forgetting it on purpose.
     */
    override public func load() {
        io.async { self.restoreFolder(attempt: 0) }
    }

    private func restoreFolder(attempt: Int) {
        guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale) else {
            retryRestore(attempt)
            return
        }
        // on iOS the real failure signal is this call, not the stale flag
        guard url.startAccessingSecurityScopedResource() else {
            retryRestore(attempt)
            return
        }
        folder = url
        holdingScope = true
        if stale { saveBookmark(for: url) } // rebuild while the scope is open
    }

    private func retryRestore(_ attempt: Int) {
        let delays: [Double] = [0.5, 2, 5]
        guard attempt < delays.count else { return } // folderStatus will ask for a re-pick
        io.asyncAfter(deadline: .now() + delays[attempt]) {
            self.restoreFolder(attempt: attempt + 1)
        }
    }

    private func saveBookmark(for url: URL) {
        guard let data = try? url.bookmarkData() else { return }
        UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
        UserDefaults.standard.set(url.lastPathComponent, forKey: Self.displayKey)
    }

    @objc func pickFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pickCall == nil else {
                call.reject("a folder picker is already open", "PICKER_BUSY")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("no window to present from", "NO_HOST")
                return
            }
            self.pickCall = call
            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [UTType.folder], asCopy: false)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            // a swipe-down dismissal is neither "picked" nor "cancelled" as
            // far as the picker is concerned — without this the JS promise
            // would hang forever
            picker.presentationController?.delegate = self
            host.present(picker, animated: true)
        }
    }

    /** main thread only; hands the call over exactly once */
    private func takePickCall() -> CAPPluginCall? {
        let call = pickCall
        pickCall = nil
        return call
    }

    public func documentPicker(
        _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
    ) {
        let call = takePickCall()
        guard let url = urls.first else {
            call?.reject("nothing chosen", "PICK_CANCELLED")
            return
        }
        io.async {
            guard url.startAccessingSecurityScopedResource() else {
                call?.reject("could not open that folder", "NO_ACCESS")
                return
            }
            if let old = self.folder, self.holdingScope, old != url {
                old.stopAccessingSecurityScopedResource()
            }
            self.folder = url
            self.holdingScope = true
            self.saveBookmark(for: url) // built while the scope is open
            call?.resolve(["name": url.lastPathComponent, "path": url.path])
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        takePickCall()?.reject("cancelled", "PICK_CANCELLED")
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        takePickCall()?.reject("cancelled", "PICK_CANCELLED")
    }

    /**
     * Where the pages live right now, and whether we are locked out.
     * "needsPick" is the honest middle state: a folder was chosen once and
     * we cannot reach it — better to say so than to quietly write somewhere
     * else and split the vault in two.
     */
    @objc func folderStatus(_ call: CAPPluginCall) {
        io.async {
            let remembered = UserDefaults.standard.data(forKey: Self.bookmarkKey) != nil
            call.resolve([
                "mode": self.folder != nil ? "folder" : "documents",
                "needsPick": remembered && self.folder == nil,
                "name": UserDefaults.standard.string(forKey: Self.displayKey) ?? "",
            ])
        }
    }

    @objc func forgetFolder(_ call: CAPPluginCall) {
        io.async {
            if let f = self.folder, self.holdingScope {
                f.stopAccessingSecurityScopedResource()
            }
            self.folder = nil
            self.holdingScope = false
            UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
            UserDefaults.standard.removeObject(forKey: Self.displayKey)
            call.resolve()
        }
    }
}

