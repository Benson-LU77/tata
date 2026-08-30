"use client";

import { useEffect, useRef } from "react";
import { Annotation, Compartment, EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  Decoration,
  WidgetType,
  drawSelection,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { autocompletion, startCompletion } from "@codemirror/autocomplete";
import { tooltips } from "@codemirror/view";
import type { CompletionContext, Completion } from "@codemirror/autocomplete";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { stampRows, stampMenu } from "../lib/city/sprites/stamps";
import { tags } from "@lezer/highlight";

/** marks a doc swap that came from opening another page — it is not
 *  an edit, and reporting it as one marked fresh pages dirty and armed
 *  saves for text nobody typed */
const External = Annotation.define<boolean>();

export type EditorApi = {
  toggle: (kind: "list" | "todo" | "heading") => void;
  getSelection: () => string;
  focus: () => void;
  cursorToEnd: () => void;
};

/* ---------- live-preview highlighting ---------- */

const noteHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: "nh1" },
  { tag: tags.heading2, class: "nh2" },
  { tag: tags.heading3, class: "nh3" },
  { tag: tags.strong, class: "nstrong" },
  { tag: tags.emphasis, class: "nem" },
  { tag: tags.quote, class: "nquote" },
  { tag: tags.processingInstruction, class: "nmark" },
  { tag: tags.contentSeparator, class: "nrule" },
  { tag: tags.monospace, class: "ncode" },
]);

/* ---------- clickable task checkboxes ---------- */

class TaskBox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskBox) {
    return other.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-taskbox" + (this.checked ? " done" : "");
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

const TASK_RE = /^(\s*)- \[( |x)\] /;

function buildTaskDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const m = line.text.match(TASK_RE);
    if (!m) continue;
    const checked = m[2] === "x";
    const boxFrom = line.from + m[1].length;
    const boxTo = boxFrom + 6; // "- [x] "
    if (checked) {
      builder.add(line.from, line.from, Decoration.line({ class: "cm-task-done" }));
    }
    builder.add(boxFrom, boxTo, Decoration.replace({ widget: new TaskBox(checked) }));
  }
  return builder.finish();
}

const taskField = StateField.define<DecorationSet>({
  create: buildTaskDecorations,
  update(deco, tr) {
    return tr.docChanged || tr.selection ? buildTaskDecorations(tr.state) : deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* ---------- pixel stamps: ::cat:: renders as a small drawing ---------- */

const STAMP_PAL = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];

class StampWidget extends WidgetType {
  constructor(readonly name: string) {
    super();
  }
  eq(other: StampWidget) {
    return other.name === this.name;
  }
  toDOM() {
    const rows = stampRows(this.name);
    const canvas = document.createElement("canvas");
    canvas.className = "cm-stamp";
    if (!rows) return canvas;
    const w = rows[0].length;
    const h = rows.length;
    canvas.width = w;
    canvas.height = h;
    const scale = Math.max(1, Math.round(18 / h));
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const ch = rows[y][x];
          if (ch === ".") continue;
          ctx.fillStyle = STAMP_PAL[ch.charCodeAt(0) - 48] ?? STAMP_PAL[4];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return canvas;
  }
  ignoreEvent() {
    return true;
  }
}

const STAMP_RE = /::([\p{L}\p{N}_]+)::/gu;

function buildStampDecorations(state: EditorState): DecorationSet {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    if (lineNo === cursorLine) continue; // stay editable under the cursor
    const line = state.doc.line(lineNo);
    STAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STAMP_RE.exec(line.text)) !== null) {
      if (!stampRows(m[1])) continue;
      builder.add(
        line.from + m.index,
        line.from + m.index + m[0].length,
        Decoration.replace({ widget: new StampWidget(m[1]) }),
      );
    }
  }
  return builder.finish();
}

const stampField = StateField.define<DecorationSet>({
  create: buildStampDecorations,
  update(deco, tr) {
    return tr.docChanged || tr.selection ? buildStampDecorations(tr.state) : deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* ---------- live preview: hide markup away from the cursor ---------- */

class BulletDot extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-bullet";
    el.textContent = "•";
    return el;
  }
  eq() {
    return true;
  }
}

function buildMarkHiding(state: EditorState): DecorationSet {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const ranges: { from: number; to: number; deco: Decoration }[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      const name = node.name;
      if (
        name !== "ListMark" &&
        name !== "HeaderMark" &&
        name !== "EmphasisMark" &&
        name !== "QuoteMark"
      )
        return;
      const line = state.doc.lineAt(node.from);
      if (TASK_RE.test(line.text)) return; // task rows are handled by the checkbox field
      const onCursorLine = line.number === cursorLine;

      if (name === "ListMark") {
        const mark = state.doc.sliceString(node.from, node.to);
        if (/^\d+[.)]$/.test(mark)) {
          ranges.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-olmark" }),
          });
        } else if (!onCursorLine) {
          ranges.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new BulletDot() }),
          });
        }
        return;
      }

      if (name === "QuoteMark") {
        ranges.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: "cm-quoteline" }),
        });
        if (!onCursorLine) {
          let to = node.to;
          if (state.doc.sliceString(to, to + 1) === " ") to += 1;
          ranges.push({ from: node.from, to, deco: Decoration.replace({}) });
        }
        return;
      }

      if (onCursorLine) return;

      if (name === "HeaderMark") {
        let to = node.to;
        if (state.doc.sliceString(to, to + 1) === " ") to += 1;
        ranges.push({ from: node.from, to, deco: Decoration.replace({}) });
      } else if (name === "EmphasisMark") {
        ranges.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
      }
    },
  });

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) builder.add(r.from, r.to, r.deco);
  return builder.finish();
}

const markHideField = StateField.define<DecorationSet>({
  create: buildMarkHiding,
  update(deco, tr) {
    return tr.docChanged || tr.selection ? buildMarkHiding(tr.state) : deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const taskClick = EditorView.domEventHandlers({
  pointerdown(event, view) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("cm-taskbox")) return false;
    const pos = view.posAtDOM(target);
    const line = view.state.doc.lineAt(pos);
    const m = line.text.match(TASK_RE);
    if (!m) return false;
    const markPos = line.from + m[1].length + 3;
    const checked = m[2] === "x";
    view.dispatch({
      changes: { from: markPos, to: markPos + 1, insert: checked ? " " : "x" },
    });
    event.preventDefault();
    return true;
  },
});

/** [[wikilink]] click-to-open — click inside the brackets jumps pages */
function wikiClick(getOpen: () => ((name: string) => void) | undefined) {
  return EditorView.domEventHandlers({
    pointerdown(event, view) {
      const open = getOpen();
      if (!open) return false;
      const target = event.target as HTMLElement;
      const pos = view.posAtDOM(target, 0);
      const line = view.state.doc.lineAt(pos);
      const col = pos - line.from;
      const re = /\[\[([^\]]+)\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.text)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          open(m[1]);
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
  });
}

/** #tag click-to-search */
function tagClick(getOpen: () => ((tag: string) => void) | undefined) {
  return EditorView.domEventHandlers({
    pointerdown(event, view) {
      const open = getOpen();
      if (!open) return false;
      const target = event.target as HTMLElement;
      const pos = view.posAtDOM(target, 0);
      const line = view.state.doc.lineAt(pos);
      const col = pos - line.from;
      const re = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.text)) !== null) {
        const start = m.index + m[1].length;
        if (col >= start && col <= start + m[2].length + 1) {
          open(m[2]);
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
  });
}

/* ---------- slash commands ---------- */

/** command metadata: bilingual name + what it actually inserts */
const SLASH_DEFS: { label: string; en: string; zh: string; preview: string }[] = [
  { label: "/todo", en: "to-do checkbox", zh: "待辦核取方塊", preview: "- [ ] …" },
  { label: "/list", en: "bullet list", zh: "項目符號清單", preview: "- …" },
  { label: "/numbered", en: "numbered list", zh: "編號清單", preview: "1. …" },
  { label: "/h2", en: "section heading", zh: "大標題", preview: "## …" },
  { label: "/h3", en: "small heading", zh: "小標題", preview: "### …" },
  { label: "/quote", en: "quote block", zh: "引言區塊", preview: "> …" },
  { label: "/divider", en: "horizontal divider", zh: "分隔線", preview: "———" },
  { label: "/now", en: "current time stamp", zh: "現在時間戳記", preview: "> 21:30" },
  { label: "/capsule", en: "time capsule — sealed until a date", zh: "時間膠囊，封緘到指定日期", preview: "> [!capsule] 2027-08-18" },
  { label: "/stamp", en: "pixel stamp picker", zh: "像素印章（也可直接輸入 ::）", preview: "::貓:: → 🐱" },
];

function slashSource(
  getChannel: () => string,
  getLang: () => "en" | "zh",
  getTemplates: () => { name: string; content: string }[],
) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\/\w*$/);
    if (!match) return null;
    const before = context.state.doc.sliceString(
      Math.max(0, match.from - 1),
      match.from,
    );
    if (before !== "" && before !== "\n" && before !== " ") return null;

    const stamp = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ch = getChannel();
      return `> ${pad(now.getHours())}:${pad(now.getMinutes())}${ch ? ` · ${ch}` : ""}\n\n`;
    };
    const insert = (text: string): Completion["apply"] =>
      (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      };

    const lang = getLang();
    const meta = (label: string) => {
      const d = SLASH_DEFS.find((x) => x.label === label);
      return d
        ? { detail: lang === "zh" ? d.zh : d.en, info: d.preview }
        : { detail: "", info: "" };
    };
    // boost keeps the menu in most-used order (CM sorts alphabetically
    // otherwise) — and makes /todo, not /divider, the Enter default
    const options: Completion[] = [
      { label: "/todo", ...meta("/todo"), boost: 9, apply: insert("- [ ] ") },
      { label: "/list", ...meta("/list"), boost: 8, apply: insert("- ") },
      { label: "/numbered", ...meta("/numbered"), boost: 7, apply: insert("1. ") },
      { label: "/h2", ...meta("/h2"), boost: 6, apply: insert("## ") },
      { label: "/h3", ...meta("/h3"), boost: 5, apply: insert("### ") },
      { label: "/quote", ...meta("/quote"), boost: 4, apply: insert("> ") },
      {
        label: "/stamp",
        ...meta("/stamp"),
        boost: 4.5,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "::" },
            selection: { anchor: from + 2 },
          });
          window.setTimeout(() => startCompletion(view), 30);
        },
      },
      {
        label: "/capsule",
        ...meta("/capsule"),
        boost: 4.2,
        apply: (view, _completion, from, to) => {
          const d = new Date();
          d.setFullYear(d.getFullYear() + 1);
          const pad2 = (n: number) => String(n).padStart(2, "0");
          const text = `> [!capsule] ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}\n\n`;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      },
      {
        label: "/divider",
        ...meta("/divider"),
        boost: 3,
        // markdown trap: "---" straight under text turns that text into a
        // setext heading — pad a blank line so it stays a divider
        apply: (view, _completion, from, to) => {
          const line = view.state.doc.lineAt(from);
          const prevFilled = line.number > 1 && view.state.doc.line(line.number - 1).text.trim() !== "";
          const text = (prevFilled ? "\n" : "") + "---\n";
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      },
      ...getTemplates().map((tpl) => ({
        label: `/${tpl.name}`,
        detail: lang === "zh" ? "自訂模板" : "your template",
        info: tpl.content.split("\n")[0] || tpl.name,
        apply: insert(tpl.content),
      })),
      {
        label: "/now",
        ...meta("/now"),
        boost: 2,
        apply: (view, _completion, from, to) => {
          const text = stamp();
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      },
    ];
    return { from: match.from, options, validFor: /^\/\w*$/ };
  };
}

/* ---------- ::stamp:: autocomplete ---------- */

function stampSource(lang: () => "en" | "zh" | undefined) {
  return (context: CompletionContext) => {
    // never poke at a composition in progress — the IME owns the keys
    if (context.view?.composing) return null;
    // fullwidth colons count: a Chinese IME types :: without switching
    const match = context.matchBefore(/[:\uff1a]{2}[\p{L}\p{N}_]*$/u);
    if (!match) return null;
    const options: Completion[] = stampMenu(lang() === "zh" ? "zh" : "en").map(({ insert, id }) => ({
      label: `::${insert}::`,
      detail: id,
      apply: (view: EditorView, _c: Completion, from: number, to: number) => {
        const text = `::${insert}:: `;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
    }));
    return { from: match.from, options, validFor: /^[:\uff1a]{2}[\p{L}\p{N}_]*$/u };
  };
}

/* ---------- [[wikilink]] autocomplete ---------- */

function wikiSource(getPages: () => string[]) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[[^\]]*$/);
    if (!match) return null;
    const options: Completion[] = getPages().map((file) => {
      const name = file.replace(/\.md$/, "");
      return {
        label: name,
        apply: (view: EditorView, _c: Completion, from: number, to: number) => {
          const text = `${name}]]`;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      };
    });
    return { from: match.from + 2, options, validFor: /^[^\]]*$/ };
  };
}

/* ---------- inline formatting (Cmd+B / Cmd+I) ---------- */

function wrapInline(view: EditorView, marker: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const n = marker.length;
  const before = view.state.doc.sliceString(Math.max(0, from - n), from);
  const after = view.state.doc.sliceString(to, to + n);
  if (before === marker && after === marker) {
    view.dispatch({
      changes: [
        { from: from - n, to: from, insert: "" },
        { from: to, to: to + n, insert: "" },
      ],
      selection: { anchor: from - n, head: to - n },
    });
    return true;
  }
  view.dispatch({
    changes: { from, to, insert: `${marker}${selected}${marker}` },
    selection: selected
      ? { anchor: from + n, head: to + n }
      : { anchor: from + n },
  });
  return true;
}

const inlineKeys = keymap.of([
  { key: "Mod-b", run: (view) => wrapInline(view, "**") },
  { key: "Mod-i", run: (view) => wrapInline(view, "*") },
]);

/* ---------- toolbar line-prefix cycles ---------- */

const PREFIX_RE = /^(\s*)(- \[[ x]\] |- |\d+\. |#{1,3} )?/;

/**
 * list: none → "- " → "1. " → none （點三下循環，最後一下取消）
 * heading: none → "## " → "### " → none
 * todo: on/off
 */
function toggleLines(view: EditorView, kind: "list" | "todo" | "heading") {
  const { state } = view;
  const fromLine = state.doc.lineAt(state.selection.main.from).number;
  const toLine = state.doc.lineAt(state.selection.main.to).number;
  const firstPrefix =
    state.doc.line(fromLine).text.match(PREFIX_RE)?.[2] ?? "";

  let mode: "bullet" | "ordered" | "todo" | "h2" | "h3" | "none";
  if (kind === "list") {
    if (firstPrefix === "- ") mode = "ordered";
    else if (/^\d+\. $/.test(firstPrefix)) mode = "none";
    else mode = "bullet";
  } else if (kind === "heading") {
    if (firstPrefix === "## ") mode = "h3";
    else if (firstPrefix === "### ") mode = "none";
    else mode = "h2";
  } else {
    const isTodo = firstPrefix === "- [ ] " || firstPrefix === "- [x] ";
    mode = isTodo ? "none" : "todo";
  }

  const changes: { from: number; to: number; insert: string }[] = [];
  let index = 1;
  for (let n = fromLine; n <= toLine; n += 1) {
    const line = state.doc.line(n);
    const m = line.text.match(PREFIX_RE)!;
    const indent = m[1];
    const target =
      mode === "none"
        ? ""
        : mode === "bullet"
          ? "- "
          : mode === "ordered"
            ? `${index}. `
            : mode === "todo"
              ? "- [ ] "
              : mode === "h2"
                ? "## "
                : "### ";
    index += 1;
    changes.push({
      from: line.from,
      to: line.from + m[0].length,
      insert: indent + target,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

/* ---------- react wrapper ---------- */

const editableComp = new Compartment();

export function MarkdownEditor({
  value,
  docVersion,
  readOnly = false,
  channelName,
  placeholder,
  pages = [],
  onChange,
  onBlur,
  onReady,
  onOpenPage,
  lang,
  templates,
  onOpenTag,
}: {
  value: string;
  /** bumps when a document is ADOPTED (open, conflict resolve, restore).
   *  With it, external content is accepted only on version change — so a
   *  round-tripping value prop can never interrupt typing or an IME
   *  composition. Without it, falls back to value comparison. */
  docVersion?: number;
  /** sealed pages show their words but take no new ones */
  readOnly?: boolean;
  channelName: string;
  placeholder: string;
  /** vault page names for [[wikilink]] autocomplete */
  pages?: string[];
  /** UI language for command descriptions */
  lang?: "en" | "zh";
  /** vault templates joining the slash menu */
  templates?: { name: string; content: string }[];
  /** a #tag was clicked */
  onOpenTag?: (tag: string) => void;
  /** open another vault page (wikilink click) */
  onOpenPage?: (name: string) => void;
  onChange: (next: string) => void;
  onBlur: () => void;
  onReady: (api: EditorApi) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const channelRef = useRef(channelName);
  const pagesRef = useRef(pages);
  const openPageRef = useRef(onOpenPage);
  const langRef = useRef(lang ?? "en");
  const templatesRef = useRef(templates ?? []);
  const openTagRef = useRef(onOpenTag);
  const callbacksRef = useRef({ onChange, onBlur, onReady });

  useEffect(() => {
    channelRef.current = channelName;
    pagesRef.current = pages;
    openPageRef.current = onOpenPage;
    langRef.current = lang ?? "en";
    templatesRef.current = templates ?? [];
    openTagRef.current = onOpenTag;
    callbacksRef.current = { onChange, onBlur, onReady };
  }, [channelName, pages, onChange, onBlur, onReady, onOpenPage, lang, templates, onOpenTag]);

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({
            base: markdownLanguage,
            addKeymap: false,
            // setext headings are the archaic underline kind — with them
            // gone, "-" or "---" under a line never inflates it
            extensions: [{ remove: ["SetextHeading"] }],
          }),
          syntaxHighlighting(noteHighlight),
          taskField,
          stampField,
          markHideField,
          taskClick,
          wikiClick(() => openPageRef.current),
          tagClick(() => openTagRef.current),
          // The book plate clips its own contents, so the command menu is
          // hung on the body instead — otherwise it opens inside the page
          // and half of it is simply not there. Fixed, not absolute: the
          // notebook is inside a translated container, and absolute
          // coordinates measured against the viewport land thousands of
          // pixels away once an ancestor transform is in play.
          tooltips({ parent: document.body, position: "fixed" }),
          autocompletion({
            override: [
              slashSource(
                () => channelRef.current,
                () => langRef.current,
                () => templatesRef.current,
              ),
              wikiSource(() => pagesRef.current),
              stampSource(() => langRef.current),
            ],
            icons: false,
            defaultKeymap: true,
          }),
          cmPlaceholder(placeholder),
          editableComp.of(EditorView.editable.of(!readOnly)),
          inlineKeys,
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(External))
            ) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
            if (update.focusChanged && !update.view.hasFocus) {
              callbacksRef.current.onBlur();
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    callbacksRef.current.onReady({
      toggle: (kind) => toggleLines(view, kind),
      getSelection: () => {
        const { from, to } = view.state.selection.main;
        return view.state.sliceDoc(from, to);
      },
      focus: () => view.focus(),
      cursorToEnd: () => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
      },
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* External value changes (opening another note) replace the doc.
     Gated on docVersion: ordinary typing round-trips the value prop but
     never bumps the version, so the editor stays the source of truth
     between adoptions. A mid-composition adoption waits for the IME. */
  const lastVersionRef = useRef<number | null>(null);
  const pendingAdoptRef = useRef<string | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (docVersion !== undefined) {
      if (docVersion === lastVersionRef.current) return; // typing, not adoption
      lastVersionRef.current = docVersion;
    }
    const apply = (v: EditorView, next: string) => {
      const current = v.state.doc.toString();
      if (current === next) return;
      v.dispatch({
        changes: { from: 0, to: current.length, insert: next },
        selection: { anchor: next.length },
        annotations: External.of(true),
      });
    };
    if (view.composing) {
      pendingAdoptRef.current = value;
      const wait = () => {
        const v = viewRef.current;
        if (!v) return;
        if (v.composing) {
          window.setTimeout(wait, 80);
          return;
        }
        const parked = pendingAdoptRef.current;
        pendingAdoptRef.current = null;
        if (parked !== null) apply(v, parked);
      };
      window.setTimeout(wait, 80);
      return;
    }
    apply(view, value);
  }, [value, docVersion]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const apply = () => {
      const v = viewRef.current;
      if (!v) return;
      if (v.composing) {
        window.setTimeout(apply, 120); // an IME mid-word is never interrupted
        return;
      }
      v.dispatch({ effects: editableComp.reconfigure(EditorView.editable.of(!readOnly)) });
    };
    apply();
  }, [readOnly]);

  return <div className="note-cm" ref={hostRef} />;
}
