import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#071023',
      height: 64 + insets.bottom,
      paddingBottom: insets.bottom,
      borderTopWidth: 0,
    }}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if (options.tabBarButton?.({} as any) === null) return null;

        const isFocused = state.index === index;
        const color = isFocused ? '#ffffff' : '#94a3b8';
        const icon = options.tabBarIcon?.({ focused: isFocused, color, size: 24 });

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="tab"
            accessibilityState={isFocused ? { selected: true } : {}}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("unreadNotifCountChanged", (count: number) => {
      setUnreadNotifCount(count);
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#0f172a' } }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Map',
            tabBarIcon: ({ color }) => <Ionicons name="location-sharp" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarIcon: ({ color }) => (
              <View>
                <Ionicons name="people-outline" size={24} color={color} />
                {unreadNotifCount > 0 && (
                  <View style={{ position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: 'Add',
            tabBarIcon: () => (
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={28} color="#071023" />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="weather"
          options={{
            title: 'Weather',
            tabBarIcon: ({ color }) => <Ionicons name="partly-sunny-outline" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarButton: () => null,
          }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}
