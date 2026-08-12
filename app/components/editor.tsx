"use client";

import { useEffect, useRef } from "react";
import { EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
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
import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, Completion } from "@codemirror/autocomplete";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";

export type EditorApi = {
  toggle: (kind: "list" | "todo" | "heading") => void;
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
  mousedown(event, view) {
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
    mousedown(event, view) {
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
  { label: "/dream", en: "dream log template", zh: "夢境記錄模板", preview: "## Dream log + 清單" },
  { label: "/3things", en: "three good things template", zh: "三件好事模板", preview: "## Three good things + 1. 2. 3." },
  { label: "/tomorrow", en: "plan for tomorrow", zh: "明日待辦模板", preview: "## Tomorrow + 待辦" },
  { label: "/now", en: "current time stamp", zh: "現在時間戳記", preview: "> 21:30" },
];

function slashSource(getChannel: () => string, getLang: () => "en" | "zh") {
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
    const options: Completion[] = [
      { label: "/todo", ...meta("/todo"), apply: insert("- [ ] ") },
      { label: "/list", ...meta("/list"), apply: insert("- ") },
      { label: "/numbered", ...meta("/numbered"), apply: insert("1. ") },
      { label: "/h2", ...meta("/h2"), apply: insert("## ") },
      { label: "/h3", ...meta("/h3"), apply: insert("### ") },
      { label: "/quote", ...meta("/quote"), apply: insert("> ") },
      { label: "/divider", ...meta("/divider"), apply: insert("---\n") },
      { label: "/dream", ...meta("/dream"), apply: insert("## Dream log\n\n- ") },
      {
        label: "/3things",
        ...meta("/3things"),
        apply: insert("## Three good things\n\n1. \n2. \n3. "),
      },
      { label: "/tomorrow", ...meta("/tomorrow"), apply: insert("## Tomorrow\n\n- [ ] ") },
      {
        label: "/now",
        ...meta("/now"),
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

export function MarkdownEditor({
  value,
  channelName,
  placeholder,
  pages = [],
  onChange,
  onBlur,
  onReady,
  onOpenPage,
  lang,
}: {
  value: string;
  channelName: string;
  placeholder: string;
  /** vault page names for [[wikilink]] autocomplete */
  pages?: string[];
  /** UI language for command descriptions */
  lang?: "en" | "zh";
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
  const callbacksRef = useRef({ onChange, onBlur, onReady });

  useEffect(() => {
    channelRef.current = channelName;
    pagesRef.current = pages;
    openPageRef.current = onOpenPage;
    langRef.current = lang ?? "en";
    callbacksRef.current = { onChange, onBlur, onReady };
  }, [channelName, pages, onChange, onBlur, onReady, onOpenPage, lang]);

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
          markdown({ base: markdownLanguage, addKeymap: false }),
          syntaxHighlighting(noteHighlight),
          taskField,
          markHideField,
          taskClick,
          wikiClick(() => openPageRef.current),
          autocompletion({
            override: [
              slashSource(() => channelRef.current, () => langRef.current),
              wikiSource(() => pagesRef.current),
            ],
            icons: false,
            defaultKeymap: true,
          }),
          cmPlaceholder(placeholder),
          inlineKeys,
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
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

  /* External value changes (opening another note) replace the doc. */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: value.length },
      });
    }
  }, [value]);

  return <div className="note-cm" ref={hostRef} />;
}
