import type { ErrorBoundaryProps } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { useRouteFallbackStyles } from "./route-fallback.styles";

export function RouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const styles = useRouteFallbackStyles();
  const [state, setState] = useState({ pending: false, failed: false });
  const live = useRef({ active: true, pending: false });

  useEffect(() => {
    const current = live.current;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, []);

  async function retryPage() {
    const current = live.current;
    if (!current.active || current.pending) return;
    current.pending = true;
    setState({ pending: true, failed: false });
    try {
      await retry();
      if (current.active) setState({ pending: false, failed: false });
    } catch {
      if (current.active) setState({ pending: false, failed: true });
    } finally {
      current.pending = false;
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        页面暂时无法显示
      </Text>
      <Text style={styles.message}>
        可以尝试重新加载页面。如果刚刚提交过修改，请先核对处理结果，再决定是否重新提交。
      </Text>
      {state.failed ? (
        <Text accessibilityRole="alert" style={styles.message}>
          暂时未能恢复页面，请稍后重试，或关闭应用后重新打开。
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新加载页面"
        accessibilityState={{ disabled: state.pending, busy: state.pending }}
        disabled={state.pending}
        style={styles.button}
        onPress={() => void retryPage()}
      >
        <Text style={styles.buttonText}>
          {state.pending ? "正在恢复页面…" : "重新加载页面"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
