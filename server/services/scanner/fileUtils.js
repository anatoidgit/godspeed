const fs = require('fs');
const crypto = require('crypto');
const klaw = require('klaw');
const path = require('path');

const SUPPORTED_EXTS = ['.flac', '.mp3', '.ogg', '.m4a', '.wav'];

async function getAudioFiles(root) {
  const files = [];
  for await (const item of klaw(root)) {
    const ext = path.extname(item.path).toLowerCase();
    if (!item.stats.isDirectory() && SUPPORTED_EXTS.includes(ext)) {
      files.push(item.path);
    }
  }
  return files;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      console.error(`❌ Failed to hash file ${filePath}:`, err.message);
      reject(err);
    });
  });
}

module.exports = { getAudioFiles, hashFile, SUPPORTED_EXTS };