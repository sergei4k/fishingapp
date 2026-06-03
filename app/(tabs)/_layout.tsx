import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
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
            tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={24} color={color} />,
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
