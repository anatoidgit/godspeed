const { MUSIC_DIR } = require('../../config');
const { initializeDatabase } = require('./dbUtils');
const { getAudioFiles } = require('./fileUtils');
const { processAudioFile } = require('./metadataUtils');
const { updateAlbumStats } = require('./coverUtils');

async function startScan() {
  console.log('🛠 Starting scan in music directory:', MUSIC_DIR);

  // Initialize database
  await initializeDatabase();

  // Scan for audio files
  const audioFiles = await getAudioFiles(MUSIC_DIR);
  console.log(`🎧 Found ${audioFiles.length} audio files.`);

  // Process each audio file
  for (const file of audioFiles) {
    try {
      await processAudioFile(file);
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err.message);
    }
  }

  // Update album statistics
  await updateAlbumStats();
  console.log(`📊 Updated album durations and sizes.`);
  console.log(`✅ Done scanning.`);
}

startScan().catch(err => {
  console.error('❌ Scan failed:', err.message);
  process.exit(1);
});