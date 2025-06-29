const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { DB_PATH } = require('../../config');

console.log('📦 Using database at:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to connect to database:', err.message);
  } else {
    console.log('✅ Connected to database');
  }
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
      resolve(this);
    }
  });
});

module.exports = { db, dbAll, dbGet, dbRun };