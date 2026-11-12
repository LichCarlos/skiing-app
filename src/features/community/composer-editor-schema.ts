import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import {
  contentLink,
  safeExternalContentLink,
  validContentAsset,
} from "../content/markdown-model";
/** Keep literal paragraph text from turning into a heading/list on the next read. */
const SafeStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name !== "paragraph"
        ? extension
        : extension.extend({
            renderMarkdown(node, helpers, context) {
              const content = node.content ?? [];
              if (!content.length)
                return context?.previousNode?.type === "paragraph" &&
                  !context.previousNode.content?.length
                  ? "&nbsp;"
                  : "";
              return helpers
                .renderChildren(content)
                .replace(/(^|\n)([ \t]*)([#>+=-])/g, "$1$2\\$3")
                .replace(/(^|\n)([ \t]*)(\d+)([.)])(?=\s)/g, "$1$2$3\\$4")
                .replace(
                  /(^|\n)([ \t]{4,}|\t+)/g,
                  (_match, start: string, spaces: string) =>
                    start +
                    spaces.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"),
                );
            },
          }),
    );
  },
});

export function composerEditorExtensions(
  resolveImage: (src: string) => string | undefined = () => undefined,
) {
  return [
    SafeStarterKit.configure({
      underline: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        protocols: ["resort", "article"],
        isAllowedUri: (url) =>
          !!contentLink(url) || safeExternalContentLink(url),
      },
    }),
    Image.extend({
      parseHTML() {
        return [{ tag: 'img[src^="asset:"]' }];
      },
      addNodeView() {
        return ({ node }) => {
          const dom = document.createElement("figure");
          dom.contentEditable = "false";
          const draw = (src: string, alt: string) => {
            dom.replaceChildren();
            const url = validContentAsset(src) ? resolveImage(src) : undefined;
            if (url && safeExternalContentLink(url)) {
              const img = document.createElement("img");
              img.src = url;
              img.alt = alt || "正文图片";
              dom.append(img);
            } else dom.textContent = "图片不可用，请先上传或刷新内容";
          };
          draw(String(node.attrs.src), String(node.attrs.alt ?? ""));
          return {
            dom,
            update(next) {
              if (next.type !== node.type) return false;
              draw(String(next.attrs.src), String(next.attrs.alt ?? ""));
              return true;
            },
          };
        };
      },
    }),
    TableKit,
    Markdown,
  ];
}
