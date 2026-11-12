import { Text } from "../../../components/Themed";
import { useState } from "react";
import { View } from "react-native";
import { Pressable, TextInput } from "../../components/controls";
import { createThemedStyles } from "../../theme";
import {
  contentLink,
  safeExternalContentLink,
  plainMarkdown,
} from "../content/markdown-model";

export interface ComposerEditorProps {
  value: string;
  onChange: (value: string) => void;
  format: "plain_text" | "markdown_v1";
  onFormatChange: (format: "plain_text" | "markdown_v1") => void;
  editable: boolean;
  images: readonly { assetId: string; url: string }[];
}
/** Native implementation: no WebView/DOM; the wire syntax is identical to Web. */
export function ComposerRichEditor(props: ComposerEditorProps) {
  const s = useStyles();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [confirm, setConfirm] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string>();
  function insert(before: string, after = "", placeholder = "文字") {
    if (!props.editable) return;
    const start = Math.min(selection.start, props.value.length),
      end = Math.min(selection.end, props.value.length);
    const chosen =
      placeholder === "" ? "" : props.value.slice(start, end) || placeholder;
    const next =
      props.value.slice(0, start) +
      before +
      chosen +
      after +
      props.value.slice(end);
    if (Array.from(next).length > 10000) {
      setError("正文不能超过10000字符");
      return;
    }
    props.onChange(next);
    setSelection({
      start: start + before.length,
      end: start + before.length + chosen.length,
    });
    setError(undefined);
  }
  return (
    <View style={s.root}>
      <View style={s.row}>
        <Text style={s.label}>
          {props.format === "markdown_v1"
            ? "排版笔记 · Markdown v1"
            : "短动态 · 直接输入"}
        </Text>
        {props.format === "plain_text" ? (
          <Pressable
            disabled={!props.editable}
            onPress={() => setConfirm(!confirm)}
          >
            <Text style={s.action}>开启排版</Text>
          </Pressable>
        ) : null}
      </View>
      {confirm ? (
        <View>
          <Text>将当前纯文本转为笔记，原来的符号保持字面含义；尚未提交。</Text>
          <Pressable
            disabled={!props.editable}
            onPress={() => {
              props.onChange(plainMarkdown(props.value));
              props.onFormatChange("markdown_v1");
              setConfirm(false);
            }}
          >
            <Text style={s.action}>确认转换</Text>
          </Pressable>
        </View>
      ) : null}
      {props.format === "markdown_v1" ? (
        <View style={s.row}>
          {[
            {
              label: "标题",
              before: "\n## ",
              after: "\n",
              placeholder: "标题",
            },
            { label: "粗体", before: "**", after: "**" },
            { label: "斜体", before: "*", after: "*" },
            { label: "列表", before: "\n- ", after: "\n" },
            { label: "引用", before: "\n> ", after: "\n" },
          ].map((item) => (
            <Pressable
              key={item.label}
              disabled={!props.editable}
              onPress={() => insert(item.before, item.after, item.placeholder)}
              style={s.tool}
            >
              <Text style={s.action}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={!props.editable}
            onPress={() => setLinkOpen(!linkOpen)}
            style={s.tool}
          >
            <Text style={s.action}>链接</Text>
          </Pressable>
        </View>
      ) : null}
      {linkOpen ? (
        <View style={s.linkForm}>
          <TextInput
            editable={props.editable}
            accessibilityLabel="链接显示文字"
            placeholder="链接显示文字"
            value={label}
            onChangeText={setLabel}
          />
          <TextInput
            editable={props.editable}
            accessibilityLabel="链接地址"
            placeholder="https://…、article:123、resort:123"
            value={url}
            onChangeText={setUrl}
          />
          <Pressable
            disabled={!props.editable}
            onPress={() => {
              const value = url.trim();
              if (
                !label.trim() ||
                (!contentLink(value) && !safeExternalContentLink(value))
              ) {
                setError("请填写显示文字及安全链接");
                return;
              }
              insert(
                `[${label.replace(/[\]\\[]/g, "")}](${value.replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
                "",
                "",
              );
              setLinkOpen(false);
            }}
          >
            <Text style={s.action}>插入链接</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        accessibilityLabel="动态正文"
        editable={props.editable}
        value={props.value}
        onChangeText={props.onChange}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        multiline
        textAlignVertical="top"
        placeholder="分享今天的雪道、雪况或滑行体验"
        style={s.input}
      />
      {props.format === "markdown_v1" && props.images.length ? (
        <View style={s.row}>
          <Text>插入已上传图片：</Text>
          {props.images.map((image, i) => (
            <Pressable
              key={image.assetId}
              disabled={!props.editable}
              onPress={() =>
                insert(
                  `\n![正文图片 ${i + 1}](asset:${image.assetId})\n`,
                  "",
                  "",
                )
              }
              style={s.tool}
            >
              <Text style={s.action}>第{i + 1}张</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {props.format === "markdown_v1" ? (
        <Text style={s.hint}>
          手机采用轻量 Markdown 工具栏；表格可阅读，复杂表格建议在 Web
          编排。图片请先通过下方按钮上传，再插入正文。可在下方展开阅读预览。
        </Text>
      ) : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}
const useStyles = createThemedStyles((c) => ({
  root: { gap: 12 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  label: { fontWeight: "700", color: c.text },
  action: { color: c.primary, fontWeight: "600" },
  tool: {
    minHeight: 44,
    padding: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    justifyContent: "center",
  },
  input: {
    minHeight: 220,
    padding: 16,
    borderWidth: 1,
    borderColor: c.inputBorder,
    borderRadius: 16,
    color: c.text,
    backgroundColor: c.surface,
    fontSize: 16,
    lineHeight: 26,
  },
  hint: { fontSize: 12, lineHeight: 20, color: c.muted },
  linkForm: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
  },
}));
