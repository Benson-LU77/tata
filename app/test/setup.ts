/**
 * Test environment for the persistence characterization suite.
 * fake-indexeddb gives the draft journal a real (in-memory) IndexedDB,
 * so drafts.ts runs unmodified — the journal is part of what we pin down.
 */
import "fake-indexeddb/auto";

// jsdom has no canvas: PixelIcon already tolerates a null 2d context,
// but jsdom logs a noisy "not implemented" error we silence here.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// the suite tests the persistence layer, not the notebook chrome: run on
// the plain skin so the editor mounts without tapping through the cover
window.history.replaceState(null, "", "/?oldnotes");
