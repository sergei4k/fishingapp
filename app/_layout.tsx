// app/_layout.tsx
import { LanguageProvider } from '@/lib/language';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import '../global.css';

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  return (
    <LanguageProvider>
      <GestureHandlerRootView className="flex-1">
        <SQLiteProvider
        databaseName="markinfo.db"
        onInit={async (db) => {
          // create tables once
          await db.execAsync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS catches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              image_uri TEXT,
              description TEXT,
              length_cm REAL,
              weight_kg REAL,
              species TEXT,
              lat REAL,
              lon REAL,
              created_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS extra_photos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              catch_id INTEGER,
              uri TEXT,
              FOREIGN KEY(catch_id) REFERENCES catches(id) ON DELETE CASCADE
            );
          `);
        }}
      >
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
            name="settings"
            options={{ 
              title: 'Settings',
              tabBarIcon: ({ color }) => <FontAwesome name="cog" size={25} color={color} /> 
            }}
          />
        </Tabs>
      </SQLiteProvider>
    </GestureHandlerRootView>
    </LanguageProvider>
  );
}