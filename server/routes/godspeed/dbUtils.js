const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const { DB_PATH } = require('../../config');

console.log('📦 Using database at:', DB_PATH);

// Check if the database file and its directory are writable
async function checkDatabasePermissions() {
  try {
    await fs.access(DB_PATH, fs.constants.F_OK | fs.constants.W_OK);
    console.log('✅ Database file is writable:', DB_PATH);
  } catch (err) {
    console.error('❌ Database file is not writable:', err.message);
    throw new Error(`Cannot write to database file at ${DB_PATH}: ${err.message}`);
  }

  const parentDir = path.dirname(DB_PATH);
  try {
    await fs.access(parentDir, fs.constants.F_OK | fs.constants.W_OK);
    console.log('✅ Database parent directory is writable:', parentDir);
  } catch (err) {
    console.error('❌ Database parent directory is not writable:', err.message);
    throw new Error(`Cannot write to database parent directory ${parentDir}: ${err.message}`);
  }
}

// Initialize database with read-write mode
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Failed to connect to database:', err.message);
    throw err;
  } else {
    console.log('✅ Connected to database');
  }
});

// Check permissions on startup
checkDatabasePermissions().catch((err) => {
  console.error('❌ Database permission check failed:', err.message);
  process.exit(1); // Exit process if database is not writable
});

// Helper function to promisify db operations
const dbAll = (sql, params) => new Promise((resolve, reject) => {
  console.log('🔍 Executing query:', sql, 'with params:', params);
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ Database query error (dbAll):', err.message, 'for query:', sql);
      reject(err);
    } else {
      console.log('✅ Query returned', rows.length, 'rows');
      resolve(rows);
    }
  });
});

const dbGet = (sql, params) => new Promise((resolve, reject) => {
  console.log('🔍 Executing query:', sql, 'with params:', params);
  db.get(sql, params, (err, row) => {
    if (err) {
      console.error('❌ Database query error (dbGet):', err.message, 'for query:', sql);
      reject(err);
    } else {
      console.log('✅ Query returned row:', row);
      resolve(row);
    }
  });
});

const dbRun = (sql, params) => new Promise((resolve, reject) => {
  console.log('🔍 Executing query:', sql, 'with params:', params);
  db.run(sql, params, function (err) {
    if (err) {
      console.error('❌ Database query error (dbRun):', err.message, 'for query:', sql);
      reject(err);
    } else {
      console.log('✅ Query executed, lastID:', this.lastID, 'changes:', this.changes);
      resolve({ lastID: this.lastID, changes: this.changes });
    }
  });
});

module.exports = { db, dbAll, dbGet, dbRun };