import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            tabBarStyle: {
              backgroundColor: '#071023',
              borderTopColor: '#0b1220',
              height: 70 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 10,
              paddingHorizontal: 0,
            },
            tabBarActiveTintColor: '#60a5fa',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarIconStyle: { marginTop: 0 },
            tabBarItemStyle: { paddingVertical: 5, flex: 1 }
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ 
              title: 'Map',
              tabBarIcon: ({ color }) => <FontAwesome name="map" size={25} color={color} /> 
            }}
          />
          <Tabs.Screen
            name="add"
            options={{ 
              title: 'Add',
              tabBarIcon: ({ color }) => <FontAwesome name="plus" size={25} color={color} /> 
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{ 
              title: 'Profile',
              tabBarIcon: ({ color }) => <FontAwesome name="user" size={25} color={color} /> 
            }}
          />
          <Tabs.Screen
            name="social"
            options={{
              title: 'Social',
              tabBarIcon: ({ color }) => <FontAwesome name="users" size={23} color={color} />
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => <FontAwesome name="cog" size={25} color={color} />
            }}
          />
        </Tabs>
    </GestureHandlerRootView>
  );
}
