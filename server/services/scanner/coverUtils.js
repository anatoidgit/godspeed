const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { MUSIC_DIR } = require('../../config');
const { getDb } = require('./dbUtils');

async function handleAlbumCover(albumDir, albumId) {
  const db = getDb();
  const candidates = ['cover.jpg', 'cover.jpeg', 'folder.jpg', 'folder.jpeg', 'cover.png', 'folder.png'];
  let coverPath = null;

  // Check if thumbnail regeneration is needed
  const regen = await new Promise((resolve) => {
    db.get(
      `SELECT needs_thumb_regen FROM albums WHERE id = ?`,
      [albumId],
      (err, row) => {
        if (err || !row) {
          console.error(`❌ Failed to check needs_thumb_regen for album ${albumId}:`, err?.message);
          return resolve(true);
        }
        resolve(row.needs_thumb_regen === 1);
      }
    );
  });

  if (!regen) {
    console.log(`🖼️ Thumbnail regeneration not needed for album ${albumId}`);
    return;
  }

  // Locate cover image
  for (const name of candidates) {
    const fullPath = path.join(albumDir, name);
    try {
      await fs.access(fullPath);
      coverPath = fullPath;
      break;
    } catch {
      // File doesn't exist
    }
  }

  if (!coverPath) {
    console.log(`⚠️ No cover image found for album ${albumId}`);
    return;
  }

  // Ensure thumbs directory
  const thumbsDir = path.join(MUSIC_DIR, 'thumbs');
  await fs.mkdir(thumbsDir, { recursive: true });

  // Generate thumbnail
  const thumbPath = path.join(thumbsDir, `thumb-${albumId}.webp`);
  try {
    await sharp(coverPath)
      .resize(300, 300, { fit: 'inside' })
      .webp()
      .toFile(thumbPath);

    db.run(
      `UPDATE albums SET cover_path = ?, thumb_path = ?, needs_thumb_regen = 0 WHERE id = ?`,
      [coverPath, thumbPath, albumId],
      (err) => {
        if (err) {
          console.error(`❌ Failed to update album cover for album ${albumId}:`, err.message);
        } else {
          console.log(`🖼️ Cover and thumbnail set for album ${albumId}`);
        }
      }
    );
  } catch (err) {
    console.error(`❌ Failed to process cover image for album ${albumId}:`, err.message);
  }
}

async function updateAlbumStats() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT id FROM albums`, [], (err, albums) => {
      if (err) {
        console.error('❌ Failed to fetch albums for stats update:', err.message);
        return reject(err);
      }

      let remaining = albums.length;
      if (remaining === 0) return resolve();

      albums.forEach(album => {
        db.get(
          `SELECT 
             SUM(duration) AS total_duration,
             SUM(file_size) AS total_size
           FROM tracks
           WHERE album_id = ?`,
          [album.id],
          (err, row) => {
            if (err) {
              console.error(`❌ Failed to compute stats for album ${album.id}:`, err.message);
              return reject(err);
            }

            db.run(
              `UPDATE albums SET duration = ?, total_size = ? WHERE id = ?`,
              [row.total_duration || 0, row.total_size || 0, album.id],
              err => {
                if (err) {
                  console.error(`❌ Failed to update stats for album ${album.id}:`, err.message);
                  return reject(err);
                }
                remaining--;
                if (remaining === 0) resolve();
              }
            );
          }
        );
      });
    });
  });
}

module.exports = { handleAlbumCover, updateAlbumStats };