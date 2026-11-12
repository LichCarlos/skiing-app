import { Text } from "../../../components/Themed";
import { Fragment, type ReactNode, useMemo } from "react";
import { Image, Linking, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { createThemedStyles } from "../../theme";
import {
  contentLink,
  parseMarkdownContent,
  safeExternalContentLink,
  validContentAsset,
  type ContentNode,
} from "./markdown-model";

export function MarkdownView({
  source,
  format,
  images = [],
}: {
  source: string;
  format?: string;
  images?: readonly { assetId: string; url: string }[];
}) {
  const s = useStyles();
  const tree = useMemo(() => {
    if (format !== "markdown_v1") return null;
    try {
      return parseMarkdownContent(source);
    } catch {
      return null;
    }
  }, [source, format]);
  if (!tree)
    return (
      <Text selectable style={s.plain}>
        {source}
      </Text>
    );
  const urls = new Map(
    images.map((image) => [`asset:${image.assetId}`, image.url]),
  );
  const definitions = new Map<string, string>();
  const collect = (n: ContentNode) => {
    if (n.type === "definition") definitions.set(n.identifier!, n.url!);
    for (const c of n.children ?? []) collect(c);
  };
  collect(tree);
  function render(node: ContentNode, key: string): ReactNode {
    const children = node.children?.map((child, i) =>
      render(child, `${key}.${i}`),
    );
    const url = node.url ?? definitions.get(node.identifier ?? "") ?? "";
    switch (node.type) {
      case "root":
        return (
          <View key={key} style={s.root}>
            {children}
          </View>
        );
      case "text":
        return node.value;
      case "definition":
      case "html":
        return null;
      case "paragraph":
        return node.children?.some(
          (n) => n.type === "image" || n.type === "imageReference",
        ) ? (
          <View key={key}>
            {node.children.map((child, i) =>
              child.type === "image" || child.type === "imageReference" ? (
                render(child, `${key}.${i}`)
              ) : (
                <Text key={`${key}.${i}`} style={s.paragraph}>
                  {render(child, `${key}.text.${i}`)}
                </Text>
              ),
            )}
          </View>
        ) : (
          <Text selectable key={key} style={s.paragraph}>
            {children}
          </Text>
        );
      case "heading":
        return (
          <Text
            accessibilityRole="header"
            key={key}
            style={[
              s.heading,
              { fontSize: node.depth === 1 ? 25 : node.depth === 2 ? 22 : 19 },
            ]}
          >
            {children}
          </Text>
        );
      case "strong":
        return (
          <Text key={key} style={s.bold}>
            {children}
          </Text>
        );
      case "emphasis":
        return (
          <Text key={key} style={s.italic}>
            {children}
          </Text>
        );
      case "delete":
        return (
          <Text key={key} style={s.strike}>
            {children}
          </Text>
        );
      case "inlineCode":
        return (
          <Text key={key} style={s.code}>
            {node.value}
          </Text>
        );
      case "code":
        return (
          <ScrollView key={key} horizontal style={s.codeBlock}>
            <Text selectable style={s.code}>
              {node.value}
            </Text>
          </ScrollView>
        );
      case "break":
        return "\n";
      case "thematicBreak":
        return <View key={key} style={s.rule} />;
      case "blockquote":
        return (
          <View key={key} style={s.quote}>
            {children}
          </View>
        );
      case "list":
        return (
          <View key={key}>
            {node.children?.map((child, i) => (
              <View key={`${key}.${i}`} style={s.listItem}>
                <Text style={s.paragraph}>
                  {node.ordered ? `${(node.start ?? 1) + i}.` : "•"}{" "}
                </Text>
                <View style={s.listBody}>
                  {render(child, `${key}.body.${i}`)}
                </View>
              </View>
            ))}
          </View>
        );
      case "listItem":
        return <View key={key}>{children}</View>;
      case "link":
      case "linkReference": {
        const logical = contentLink(url);
        if (logical)
          return (
            <Link
              key={key}
              style={s.link}
              href={
                logical.type === "article"
                  ? {
                      pathname: "/knowledge/[articleId]",
                      params: { articleId: logical.id },
                    }
                  : {
                      pathname: "/resorts/[resortId]",
                      params: { resortId: logical.id },
                    }
              }
            >
              {children}
            </Link>
          );
        return safeExternalContentLink(url) ? (
          <Text
            accessibilityRole="link"
            key={key}
            style={s.link}
            onPress={() => {
              void Linking.openURL(url).catch(() => undefined);
            }}
          >
            {children}
          </Text>
        ) : (
          <Text key={key}>{children}</Text>
        );
      }
      case "image":
      case "imageReference": {
        const uri = validContentAsset(url) ? urls.get(url) : undefined;
        return uri && safeExternalContentLink(uri) ? (
          <Image
            key={key}
            source={{ uri }}
            resizeMode="contain"
            accessibilityLabel={node.alt || "正文图片"}
            style={s.image}
          />
        ) : (
          <Text key={key} style={s.placeholder}>
            图片不可用，请刷新内容重新获取地址
          </Text>
        );
      }
      case "table":
        return (
          <ScrollView key={key} horizontal accessibilityLabel="文章表格">
            <View>
              {node.children?.map((row, i) => (
                <View key={`${key}.${i}`} style={s.tableRow}>
                  {row.children?.map((cell, j) => (
                    <View
                      key={`${key}.${i}.${j}`}
                      style={[s.cell, i === 0 ? s.tableHeader : undefined]}
                    >
                      <Text style={s.paragraph}>
                        {cell.children?.map((c, k) =>
                          render(c, `${key}.${i}.${j}.${k}`),
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      default:
        return <Fragment key={key}>{children ?? node.value ?? ""}</Fragment>;
    }
  }
  return <>{render(tree, "body")}</>;
}
const useStyles = createThemedStyles((c) => ({
  root: { gap: 8 },
  plain: { color: c.text, fontSize: 16, lineHeight: 28 },
  paragraph: { color: c.text, fontSize: 16, lineHeight: 28, marginVertical: 5 },
  heading: {
    color: c.text,
    fontWeight: "700",
    lineHeight: 34,
    marginTop: 18,
    marginBottom: 6,
  },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  link: { color: c.primary, textDecorationLine: "underline" },
  code: {
    fontFamily: "monospace",
    color: c.text,
    backgroundColor: c.segment,
    fontSize: 14,
  },
  codeBlock: { backgroundColor: c.segment, padding: 12, borderRadius: 10 },
  rule: { height: 1, backgroundColor: c.border, marginVertical: 18 },
  quote: {
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
    paddingLeft: 14,
    marginVertical: 8,
  },
  listItem: { flexDirection: "row", paddingLeft: 8 },
  listBody: { flex: 1 },
  image: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    marginVertical: 10,
    backgroundColor: c.soft,
  },
  placeholder: {
    padding: 16,
    color: c.muted,
    borderWidth: 1,
    borderColor: c.border,
  },
  tableRow: { flexDirection: "row" },
  cell: { width: 170, padding: 10, borderWidth: 1, borderColor: c.border },
  tableHeader: { backgroundColor: c.segment },
}));
