import { composerEditorExtensions } from "./composer-editor-schema";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  contentLink,
  safeExternalContentLink,
  plainMarkdown,
  markdownImportIssue,
} from "../content/markdown-model";
import type { ComposerEditorProps } from "./composer-rich-editor";
import "./composer-rich-editor.css";

export function ComposerRichEditor(props: ComposerEditorProps) {
  const latest = useRef(props);
  latest.current = props;
  const urls = useRef<Record<string, string>>({});
  urls.current = Object.fromEntries(
    props.images.map((image) => [`asset:${image.assetId}`, image.url]),
  );
  const [source, setSource] = useState(false),
    [confirm, setConfirm] = useState(false),
    [issue, setIssue] = useState<string>(),
    [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState(""),
    [label, setLabel] = useState("");
  const [, refresh] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const extensions = useState(() =>
    composerEditorExtensions((src) => urls.current[src]),
  )[0];
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content:
      props.format === "markdown_v1" && !markdownImportIssue(props.value)
        ? props.value
        : "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": "动态富文本正文",
        role: "textbox",
        "aria-multiline": "true",
      },
      handlePaste(view, event) {
        if (event.clipboardData?.files.length) {
          setIssue("请使用下方选择图片按钮上传");
          return true;
        }
        if (event.clipboardData?.getData("text/html")) {
          view.pasteText(event.clipboardData.getData("text/plain"));
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        return !!event.dataTransfer?.files.length;
      },
    },
    onUpdate({ editor }) {
      latest.current.onChange(editor.getMarkdown());
      refresh((n) => n + 1);
    },
    onSelectionUpdate() {
      refresh((n) => n + 1);
    },
  });
  useEffect(() => {
    editor?.setEditable(
      props.editable &&
        props.format === "markdown_v1" &&
        !markdownImportIssue(props.value),
      false,
    );
  }, [editor, props.editable, props.format, props.value]);
  useEffect(() => {
    if (
      editor &&
      props.format === "markdown_v1" &&
      !markdownImportIssue(props.value) &&
      editor.getMarkdown() !== props.value
    )
      editor.commands.setContent(props.value, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [editor, props.value, props.format]);
  const enabled = props.editable && !!editor;
  const tools = [
    { label: "正文", run: () => editor?.chain().focus().setParagraph().run() },
    {
      label: "标题",
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    { label: "粗体", run: () => editor?.chain().focus().toggleBold().run() },
    { label: "斜体", run: () => editor?.chain().focus().toggleItalic().run() },
    {
      label: "列表",
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "引用",
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "表格",
      run: () =>
        editor
          ?.chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    { label: "撤销", run: () => editor?.chain().focus().undo().run() },
    { label: "重做", run: () => editor?.chain().focus().redo().run() },
  ];
  return (
    <section className="snow-composer-editor">
      <header>
        <strong>
          {props.format === "markdown_v1"
            ? "写一篇雪地笔记"
            : "短动态 · 直接输入"}
        </strong>
        <span>图片、发布与审核沿用原流程</span>
      </header>
      {props.format === "plain_text" ? (
        <>
          <textarea
            aria-label="动态正文"
            disabled={!props.editable}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            rows={9}
            placeholder="分享今天的雪道、雪况或滑行体验"
          />
          <button
            type="button"
            disabled={!props.editable}
            onClick={() => setConfirm(!confirm)}
          >
            开启富文本排版
          </button>
          {confirm ? (
            <p>
              保留原文符号的字面含义后转换。
              <button
                type="button"
                disabled={!props.editable}
                onClick={() => {
                  props.onChange(plainMarkdown(props.value));
                  props.onFormatChange("markdown_v1");
                  setConfirm(false);
                }}
              >
                确认转换
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div
            className="snow-composer-tools"
            role="group"
            aria-label="动态排版"
          >
            {tools.map((tool) => (
              <button
                type="button"
                key={tool.label}
                disabled={!enabled}
                onClick={tool.run}
              >
                {tool.label}
              </button>
            ))}
            <button
              type="button"
              disabled={!enabled}
              onClick={() => setSource(!source)}
            >
              {source ? "返回写作" : "Markdown 源文"}
            </button>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => setLinkOpen(!linkOpen)}
            >
              插入链接
            </button>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => file.current?.click()}
            >
              导入 .md
            </button>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([props.value], {
                    type: "text/markdown;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "雪友笔记.md";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              导出 .md
            </button>
          </div>
          {linkOpen ? (
            <div className="snow-composer-link">
              <label>
                显示文字
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={!enabled}
                />
              </label>
              <label>
                链接地址
                <input
                  placeholder="https://…、article:123、resort:123"
                  value={href}
                  onChange={(e) => setHref(e.target.value)}
                  disabled={!enabled}
                />
              </label>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => {
                  const url = href.trim();
                  if (
                    !label.trim() ||
                    (!contentLink(url) && !safeExternalContentLink(url))
                  ) {
                    setIssue("请填写安全链接及显示文字");
                    return;
                  }
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({
                      type: "text",
                      text: label.trim(),
                      marks: [{ type: "link", attrs: { href: url } }],
                    })
                    .run();
                  setLinkOpen(false);
                  setIssue(undefined);
                }}
              >
                插入
              </button>
            </div>
          ) : null}
          {source || markdownImportIssue(props.value) ? (
            <textarea
              aria-label="动态 Markdown 源文"
              disabled={!props.editable}
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              rows={12}
            />
          ) : (
            <EditorContent editor={editor} />
          )}
          {props.images.length ? (
            <div className="snow-composer-tools">
              <span>插入已上传图片：</span>
              {props.images.map((image, i) => (
                <button
                  type="button"
                  disabled={!enabled}
                  key={image.assetId}
                  onClick={() =>
                    editor
                      ?.chain()
                      .focus()
                      .setImage({
                        src: `asset:${image.assetId}`,
                        alt: `正文图片 ${i + 1}`,
                      })
                      .run()
                  }
                >
                  第{i + 1}张
                </button>
              ))}
            </div>
          ) : (
            <p>请先通过下方“选择图片”上传，再插入正文。</p>
          )}
          <p>
            文档与雪场引用使用稳定
            ID；不会改变下方的主要关联雪场。导出文件不含图片文件，不能离线搬运媒体。
          </p>
        </>
      )}
      {issue ||
      (props.format === "markdown_v1" && markdownImportIssue(props.value)) ? (
        <p role="alert">{issue || markdownImportIssue(props.value)}</p>
      ) : null}
      <input
        ref={file}
        type="file"
        accept=".md,text/markdown"
        hidden
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = "";
          if (!selected || !enabled) return;
          if (selected.size > 400000) {
            setIssue("文件过大");
            return;
          }
          void selected
            .text()
            .then((text) => {
              if (!latest.current.editable || editor?.isDestroyed) return;
              const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
              const problem = markdownImportIssue(source);
              if (problem || Array.from(source).length > 10000) {
                setIssue(problem ?? "动态正文最多10000字符");
                return;
              }
              if (window.confirm("用导入的 Markdown 替换当前正文？")) {
                latest.current.onChange(source);
                latest.current.onFormatChange("markdown_v1");
              }
            })
            .catch(() => setIssue("无法读取文件"));
        }}
      />
    </section>
  );
}
