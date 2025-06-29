const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { dbAll, dbGet } = require('./dbUtils');
const { MUSIC_DIR } = require('../../config');

const DEFAULT_COVER = path.join(__dirname, '../static/default-cover.jpg');
const DEFAULT_THUMB = path.join(__dirname, '../static/default-thumb.webp');

// Route: Get all albums
router.get('/albums', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM albums ORDER BY id DESC`, []);
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch albums:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve album cover
router.get('/album/:id/cover', async (req, res) => {
  const albumId = req.params.id;

  try {
    const row = await dbGet(`SELECT cover_path FROM albums WHERE id = ?`, [albumId]);
    if (!row || !row.cover_path) {
      console.warn(`⚠️ No cover path found for album ${albumId}`);
      return res.sendFile(DEFAULT_COVER);
    }

    const coverPath = row.cover_path;
    console.log(`📀 Album ${albumId} cover path:`, coverPath);

    const fullPath = path.isAbsolute(coverPath)
      ? coverPath
      : path.join(MUSIC_DIR, coverPath);

    await new Promise((resolve, reject) => {
      fs.access(fullPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.warn(`⚠️ Cover not found at path: ${fullPath}`);
          reject(fsErr);
        } else {
          resolve();
        }
      });
    });
    res.sendFile(fullPath);
  } catch (err) {
    console.error(`❌ Error serving cover for album ${albumId}:`, err);
    res.sendFile(DEFAULT_COVER);
  }
});

// Serve thumbnail
router.get('/album/:id/thumb', async (req, res) => {
  const albumId = req.params.id;

  try {
    const row = await dbGet(`SELECT thumb_path FROM albums WHERE id = ?`, [albumId]);
    if (!row || !row.thumb_path) {
      console.warn(`⚠️ No thumbnail path found for album ${albumId}`);
      return res.sendFile(DEFAULT_THUMB);
    }

    const thumbPath = row.thumb_path;
    console.log(`🖼️ Album ${albumId} thumb path:`, thumbPath);

    const fullPath = path.isAbsolute(thumbPath)
      ? thumbPath
      : path.join(MUSIC_DIR, thumbPath);

    await new Promise((resolve, reject) => {
      fs.access(fullPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.warn(`⚠️ Thumbnail not found at path: ${fullPath}`);
          reject(fsErr);
        } else {
          resolve();
        }
      });
    });
    res.sendFile(fullPath);
  } catch (err) {
    console.error(`❌ Error serving thumbnail for album ${albumId}:`, err);
    res.sendFile(DEFAULT_THUMB);
  }
});

module.exports = router;