import { MarkdownView } from "../content/markdown-view";
import { Text } from "../../../components/Themed";
import { createThemedStyles } from "../../theme";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { Image, ScrollView, View } from "react-native";
import type { components } from "../../platform/api/openapi";
import type { FavoriteState } from "../favorites/favorite-run";
import { ApiError } from "../../platform/api/api-error";

interface Props {
  valid: boolean;
  active: boolean;
  restoring: boolean;
  loading: boolean;
  fetching: boolean;
  article: components["schemas"]["PublicArticleDetailVO"] | null;
  error: unknown;
  favorite: FavoriteState;
  loggedIn: boolean;
  canFavorite: boolean;
  onLogin: () => void;
  onReload: () => void;
  onReview: () => void;
  onFavorite: (desired: boolean) => void;
}

export function ArticleDetailView(props: Props) {
  const styles = useStyles();
  const { article, favorite } = props;
  if (!props.valid)
    return (
      <View style={styles.state}>
        <Text style={styles.muted}>文章链接无效。</Text>
      </View>
    );
  if (!props.active || props.restoring || props.loading)
    return (
      <View style={styles.state}>
        <ActivityIndicator accessibilityLabel="正在加载文章" />
        <Text style={styles.muted}>正在加载文章</Text>
      </View>
    );
  const feedback = (
    <>
      {favorite.notice ? (
        <Text accessibilityRole="alert" style={styles.muted}>
          {favorite.notice}
        </Text>
      ) : null}
      {favorite.needsReview ? (
        <Pressable
          accessibilityRole="button"
          disabled={favorite.busy || props.fetching}
          onPress={props.onReview}
        >
          <Text style={styles.action}>核对上次操作的收藏状态</Text>
        </Pressable>
      ) : null}
    </>
  );
  if (props.error || !article) {
    const unavailable =
      props.error instanceof ApiError && props.error.status === 404;
    return (
      <View style={styles.state}>
        <Text style={styles.muted}>
          {unavailable
            ? "文章不存在或已下架。"
            : "文章加载失败，请检查网络或登录状态后重试。"}
        </Text>
        {feedback}
        <Pressable
          accessibilityRole="button"
          disabled={favorite.busy || props.fetching}
          onPress={props.onReload}
        >
          <Text style={styles.action}>刷新文章</Text>
        </Pressable>
      </View>
    );
  }
  const disabled = favorite.busy || favorite.needsReview || props.fetching;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {article.coverUrl ? (
        <Image
          accessibilityLabel="文章封面"
          source={{ uri: article.coverUrl }}
          style={styles.cover}
        />
      ) : (
        <View style={styles.noCover}>
          <Text style={styles.muted}>暂无封面</Text>
        </View>
      )}
      <Text style={styles.category}>{article.category.label}</Text>
      <Text style={styles.title}>{article.title}</Text>
      <Text style={styles.summary}>{article.summary}</Text>
      <Text style={styles.byline}>
        {article.authorName || "凛迹雪客"} ·{" "}
        {new Date(article.publishTime).toLocaleDateString("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </Text>
      <View style={styles.favorite}>
        {!props.loggedIn ? (
          <Pressable accessibilityRole="button" onPress={props.onLogin}>
            <Text style={styles.action}>登录后收藏文章</Text>
          </Pressable>
        ) : !props.canFavorite ? (
          <Text style={styles.muted}>当前账号没有收藏权限。</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected: !disabled && article.favoriteByMe,
              disabled,
            }}
            disabled={disabled}
            onPress={() => props.onFavorite(!article.favoriteByMe)}
          >
            <Text style={styles.action}>
              {favorite.busy
                ? "正在保存…"
                : favorite.needsReview
                  ? "收藏状态待确认"
                  : props.fetching
                    ? "正在核对收藏状态…"
                    : article.favoriteByMe
                      ? "已收藏 · 取消收藏"
                      : "收藏文章"}
            </Text>
          </Pressable>
        )}
        {feedback}
        <Pressable
          accessibilityRole="button"
          disabled={favorite.busy || props.fetching}
          onPress={props.onReload}
        >
          <Text style={styles.action}>刷新文章与收藏状态</Text>
        </Pressable>
      </View>
      <View style={{marginTop:24,marginHorizontal:20}}><MarkdownView source={article.body} format={article.contentFormat} images={article.bodyAssets}/></View>
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors) => ({
  favorite: { marginHorizontal: 20, marginTop: 18, gap: 10 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 36 },
  cover: { width: "100%", height: 240, backgroundColor: colors.soft },
  noCover: {
    minHeight: 100,
    justifyContent: "center",
    backgroundColor: colors.soft,
  },
  category: {
    marginTop: 22,
    marginHorizontal: 20,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  title: {
    marginTop: 8,
    marginHorizontal: 20,
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 34,
  },
  summary: {
    marginTop: 11,
    marginHorizontal: 20,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  byline: {
    marginTop: 14,
    marginHorizontal: 20,
    color: colors.muted,
    fontSize: 13,
  },
  body: {
    marginTop: 24,
    marginHorizontal: 20,
    color: colors.text,
    fontSize: 16,
    lineHeight: 28,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center" },
  action: { color: colors.primary, fontSize: 14, fontWeight: "600" },
}));
