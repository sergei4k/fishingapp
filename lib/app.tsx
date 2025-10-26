import React from 'react';
import { SQLiteProvider, type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import RootLayout from '../app/_layout';
import { Stack, Tabs } from 'expo-router';

async function migrate(db: SQLiteDatabase) {
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
      geohash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS extra_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catch_id INTEGER NOT NULL,
      uri TEXT NOT NULL,
      FOREIGN KEY (catch_id) REFERENCES catches(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_catches_latlon ON catches(lat, lon);
    CREATE INDEX IF NOT EXISTS idx_catches_geohash ON catches(geohash);
  `);
}


function DBInit() {
  const db = useSQLiteContext();
  React.useEffect(() => {
    (async () => {
      await db.execAsync('PRAGMA journal_mode = WAL;');
    })();
  }, [db]);
  return null;

}

export default function App() {
  return (
    <SQLiteProvider databaseName="markinfo.db" onInit={migrate} options = {{ useNewConnection: false }}>
      <DBInit />
      <App />
    </SQLiteProvider>
  );
}
