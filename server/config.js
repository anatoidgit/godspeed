// config.js
require('dotenv').config();
const path = require('path');

// Resolve from project root (where .env is)
const projectRoot = path.resolve(__dirname, '..'); // Goes up from /server to /anatoid

module.exports = {
  MUSIC_DIR: path.resolve(projectRoot, process.env.MUSIC_DIR || './music'),
  PORT: process.env.PORT || 4000,
  DB_PATH: path.resolve(__dirname, './sql/godspeed.db'), // fixed path
  SCHEMA_PATH: path.join(__dirname, './sql/schema.sql') // Add this line
};
