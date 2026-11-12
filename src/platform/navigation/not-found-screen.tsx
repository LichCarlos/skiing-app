import { Link, Stack } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";

import { useRouteFallbackStyles } from "./route-fallback.styles";

export function NotFoundScreen() {
  const styles = useRouteFallbackStyles();
  return (
    <>
      <Stack.Screen options={{ title: "页面未找到" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={styles.title}>
          页面未找到
        </Text>
        <Text style={styles.message}>
          该页面不存在或链接已失效，可以返回首页继续浏览。
        </Text>
        <Link href="/" replace asChild>
          <Pressable accessibilityRole="link" style={styles.button}>
            <Text style={styles.buttonText}>返回首页</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </>
  );
}
