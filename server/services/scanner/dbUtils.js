const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH, SCHEMA_PATH } = require('../../config');

let db;

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const dbExists = fs.existsSync(DB_PATH);
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Failed to connect to database:', err.message);
        return reject(err);
      }
      console.log('✅ Connected to database:', DB_PATH);

      if (!dbExists) {
        console.log('📁 Creating godspeed.db...');
        const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');
        db.exec(schemaSQL, (err) => {
          if (err) {
            console.error('❌ Failed to initialize schema:', err.message);
            return reject(err);
          }
          console.log('✅ Schema initialized, including playlist tables.');
          applyMigrations().then(resolve).catch(reject);
        });
      } else {
        console.log('✅ godspeed.db exists.');
        applyMigrations().then(resolve).catch(reject);
      }
    });
  });
}

function applyMigrations() {
  return new Promise((resolve, reject) => {
    const migrations = [
      {
        query: `ALTER TABLE playlist_tracks ADD COLUMN custom_title TEXT`,
        success: '✅ Ensured custom_title column in playlist_tracks.',
        errorMsg: '❌ Failed to add custom_title to playlist_tracks:',
        ignoreError: 'duplicate column name'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks (playlist_id)`,
        success: '✅ Ensured index idx_playlist_tracks_playlist_id.',
        errorMsg: '❌ Failed to create index idx_playlist_tracks_playlist_id:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks (track_id)`,
        success: '✅ Ensured index idx_playlist_tracks_track_id.',
        errorMsg: '❌ Failed to create index idx_playlist_tracks_track_id:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name)`,
        success: '✅ Ensured index idx_artists_name.',
        errorMsg: '❌ Failed to create index idx_artists_name:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title)`,
        success: '✅ Ensured index idx_albums_title.',
        errorMsg: '❌ Failed to create index idx_albums_title:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums (artist_id)`,
        success: '✅ Ensured index idx_albums_artist_id.',
        errorMsg: '❌ Failed to create index idx_albums_artist_id:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks (album_id)`,
        success: '✅ Ensured index idx_tracks_album_id.',
        errorMsg: '❌ Failed to create index idx_tracks_album_id:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks (artist_id)`,
        success: '✅ Ensured index idx_tracks_artist_id.',
        errorMsg: '❌ Failed to create index idx_tracks_artist_id:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks (hash)`,
        success: '✅ Ensured index idx_tracks_hash.',
        errorMsg: '❌ Failed to create index idx_tracks_hash:'
      },
      {
        query: `CREATE INDEX IF NOT EXISTS idx_labels_name ON labels (name)`,
        success: '✅ Ensured index idx_labels_name.',
        errorMsg: '❌ Failed to create index idx_labels_name:'
      }
    ];

    let remaining = migrations.length;
    if (remaining === 0) return resolve();

    migrations.forEach(({ query, success, errorMsg, ignoreError }) => {
      db.run(query, (err) => {
        if (err && (!ignoreError || !err.message.includes(ignoreError))) {
          console.error(errorMsg, err.message);
        } else {
          console.log(success);
        }
        remaining--;
        if (remaining === 0) resolve();
      });
    });
  });
}

function findOrInsert(table, column, value) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id FROM ${table} WHERE ${column} = ?`, [value], (err, row) => {
      if (err) {
        console.error(`❌ Failed to query ${table} for ${column}=${value}:`, err.message);
        return reject(err);
      }
      if (row) return resolve(row.id);

      db.run(`INSERT INTO ${table} (${column}) VALUES (?)`, [value], function (err) {
        if (err) {
          console.error(`❌ Failed to insert ${value} into ${table}:`, err.message);
          return reject(err);
        }
        console.log(`✅ Inserted ${value} into ${table}, ID: ${this.lastID}`);
        resolve(this.lastID);
      });
    });
  });
}

function getDb() {
  return db;
}

module.exports = { initializeDatabase, findOrInsert, getDb };