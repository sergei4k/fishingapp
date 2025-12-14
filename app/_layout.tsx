// app/_layout.tsx
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              height: 80,
              paddingBottom: 10,
              paddingTop: 10,
            },
            tabBarActiveTintColor: '#60a5fa',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarIconStyle: { marginTop: 0 }
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ tabBarIcon: ({ color }) => <FontAwesome name="map" size={27} color={color} /> }}
          />
          <Tabs.Screen
            name="add"
            options={{  tabBarIcon: ({ color }) => <FontAwesome name="plus" size={27} color={color} padding={0} /> }}
          />
          <Tabs.Screen
            name="profile"
            options={{ tabBarIcon: ({ color }) => <FontAwesome name="user" size={27} color={color} /> }}
          />
        </Tabs>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
