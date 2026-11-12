import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useAppColors } from "../../src/theme";

export default function TabLayout() {
  const colors = useAppColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerTitleAlign: "left",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.highlight,
        tabBarInactiveTintColor: colors.onImage,
        tabBarStyle: {
          minHeight: 64,
          paddingBottom: 8,
          backgroundColor: colors.navigation,
          borderTopColor: colors.navigation,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 18,
          fontWeight: "600",
          flexShrink: 0,
        },
        tabBarItemStyle: { paddingVertical: 0 },
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
