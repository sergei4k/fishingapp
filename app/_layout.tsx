// app/_layout.tsx
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';

async function onInit(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS catches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_uri TEXT,
      description TEXT,
      length_cm REAL,
      weight_kg REAL,
      species TEXT,
      lat REAL,
      lon REAL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS extra_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catch_id INTEGER NOT NULL,
      uri TEXT NOT NULL,
      FOREIGN KEY (catch_id) REFERENCES catches(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_catches_latlon ON catches(lat, lon);
  `);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="markinfo.db" onInit={onInit}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: '#071023', borderTopColor: '#0b1220' },
            tabBarActiveTintColor: '#60a5fa',
            tabBarInactiveTintColor: '#94a3b8',
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: 'Карта', tabBarIcon: ({ color }) => <FontAwesome name="map" size={20} color={color} /> }}
          />
          <Tabs.Screen
            name="add"
            options={{ title: 'Добавить', tabBarIcon: ({ color }) => <FontAwesome name="plus" size={20} color={color} /> }}
          />
          <Tabs.Screen
            name="profile"
            options={{ title: 'Профиль', tabBarIcon: ({ color }) => <FontAwesome name="user" size={20} color={color} /> }}
          />
        </Tabs>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
