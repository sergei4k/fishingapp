import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { useEffect, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { DeviceEventEmitter, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const liquidGlassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const visibleRoutes = state.routes.filter((route) => descriptors[route.key].options.tabBarButton?.({} as any) !== null);
  const tabWidth = width / visibleRoutes.length;
  const activeIndex = Math.max(0, visibleRoutes.findIndex((route) => route.key === state.routes[state.index]?.key));
  const indicatorPosition = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    indicatorPosition.value = withSpring(activeIndex * tabWidth, {
      damping: 24,
      stiffness: 360,
      mass: 0.55,
      overshootClamping: false,
    });
  }, [activeIndex, indicatorPosition, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
  }));

  return (
    <GlassView
      style={[
        tabStyles.bar,
        { height: 64 + insets.bottom, paddingBottom: insets.bottom },
        !liquidGlassAvailable && tabStyles.fallbackBar,
      ]}
      glassEffectStyle="regular"
      tintColor={theme.colors.surface}
      isInteractive
    >
      <Animated.View
        pointerEvents="none"
        style={[tabStyles.indicator, { left: (tabWidth - 36) / 2 }, indicatorStyle]}
      />
      {visibleRoutes.map((route) => {
        const { options } = descriptors[route.key];

        const isFocused = state.routes[state.index]?.key === route.key;
        const color = isFocused ? '#ffffff' : '#94a3b8';
        const icon = options.tabBarIcon?.({ focused: isFocused, color, size: 24 });

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (route.name === 'add') DeviceEventEmitter.emit('firstCatchOnboardingAddPressed');
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
    </GlassView>
  );
}

const tabStyles = {
  bar: {
    flexDirection: 'row' as const,
    borderTopWidth: 0,
  },
  fallbackBar: {
    backgroundColor: theme.colors.surface,
  },
  indicator: {
    position: 'absolute' as const,
    top: 0,
    width: 36,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: theme.colors.primary,
  },
};

export default function TabsLayout() {
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("unreadNotifCountChanged", (count: number) => {
      setUnreadNotifCount(count);
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.background } }}
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
