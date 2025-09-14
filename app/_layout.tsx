import { FontAwesome } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#0b1220" },
          headerTintColor: "#e6eef8",
          tabBarStyle: { backgroundColor: "#071023", borderTopColor: "#0b1220" },
          tabBarActiveTintColor: "#60a5fa",
          tabBarInactiveTintColor: "#94a3b8",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Карта", tabBarIcon: ({ color }) => <FontAwesome name="map" size={20} color={color} /> }}
        />
        <Tabs.Screen
          name="add"
          options={{ title: "Добавить", tabBarIcon: ({ color }) => <FontAwesome name="plus" size={20} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: "Профиль", tabBarIcon: ({ color }) => <FontAwesome name="user" size={20} color={color} /> }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}


