import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { radius, spacing, useAppColors } from "../../src/theme";
import { RoundedTabButton } from "../../src/platform/navigation/rounded-tab-button";

export default function TabLayout() {
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { paddingTop: insets.top, backgroundColor: colors.background },
        headerTitleAlign: "left",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarLabelPosition: "below-icon",
        tabBarButton: (props) => <RoundedTabButton {...props} />,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.text,
        tabBarActiveBackgroundColor: colors.primary,
        tabBarStyle: {
          height: 84 + bottomInset,
          paddingTop: spacing.sm,
          paddingHorizontal: spacing.sm,
          paddingBottom: bottomInset,
          backgroundColor: colors.navigation,
          borderTopColor: colors.border,
          borderTopWidth: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 18,
          fontWeight: "600",
          flexShrink: 0,
        },
        tabBarItemStyle: {
          marginHorizontal: spacing.xs,
          marginBottom: spacing.sm,
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          overflow: "hidden",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "动态",
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: "bubble.left.and.bubble.right",
                android: "forum",
                web: "forum",
              }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="resorts"
        options={{
          title: "雪场",
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: "mountain.2",
                android: "landscape",
                web: "landscape",
              }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="knowledge"
        options={{
          title: "知识",
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: "book", android: "menu_book", web: "menu_book" }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          headerShown: true,
          sceneStyle: { paddingTop: 0, backgroundColor: colors.background },
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: "person.crop.circle",
                android: "account_circle",
                web: "account_circle",
              }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
