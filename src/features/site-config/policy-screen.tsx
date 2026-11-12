import { Text } from "../../../components/Themed";
import { createThemedStyles } from "../../theme";
import { ActivityIndicator, Pressable } from "../../components/controls";
import { ScrollView, View } from "react-native";
import { Link, Stack, type Href } from "expo-router";
import { useSiteConfig } from "./use-site-config";
import { policyText, type PolicyKind } from "./site-config-api";
export function PolicyScreen({
  kind,
  title,
}: {
  kind: PolicyKind;
  title: string;
}) {
  const styles = useStyles();
  const query = useSiteConfig();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title }} />
      <Text style={styles.title}>{title}</Text>
      {query.isFetching || query.isPending ? (
        <ActivityIndicator accessibilityLabel="正在加载平台信息" />
      ) : query.isError || !query.data ? (
        <View>
          <Text style={styles.body}>内容暂时无法加载。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
          >
            <Text style={styles.link}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.brand}>{query.data.siteName}</Text>
          <Text style={styles.body}>{query.data.tagline}</Text>
          <Text selectable style={styles.body}>
            {policyText(query.data, kind)}
          </Text>
          {kind === "about" && (
            <Text selectable style={styles.body}>
              联系邮箱：{query.data.contactEmail ?? "尚未配置"}
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
export function SiteInfoLinks() {
  const styles = useStyles();
  return (
    <View style={styles.links}>
      <Link href={"/about" as Href} style={styles.link}>
        关于平台
      </Link>
      <Link href={"/privacy" as Href} style={styles.link}>
        隐私政策
      </Link>
      <Link href={"/terms" as Href} style={styles.link}>
        用户协议
      </Link>
    </View>
  );
}
const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 56, gap: 18 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  brand: { fontSize: 19, fontWeight: "600", color: colors.primary },
  body: { fontSize: 16, lineHeight: 27, color: colors.text },
  link: { color: colors.primary, fontSize: 15, paddingVertical: 12 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 24, marginTop: 24 },
}));
