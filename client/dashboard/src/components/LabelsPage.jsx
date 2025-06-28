import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./labelsPage.css";
import { FaPlay, FaRandom, FaAngleDown, FaAngleUp, FaMagic } from "react-icons/fa";
import { useAudioStore } from "../stores/useAudioStore";

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (hrs > 0) parts.push(hrs.toString().padStart(2, '0'));
  parts.push(mins.toString().padStart(2, '0'));
  parts.push(secs.toString().padStart(2, '0'));
  return parts.join(':');
}

function LabelsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const preSelectedLabel = params.get('label')?.toLowerCase() || '';
  const { playQueue, currentTrackId } = useAudioStore();
  const [labels, setLabels] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState(preSelectedLabel ? [preSelectedLabel] : []);
  const [combineMode, setCombineMode] = useState('and');
  const [albums, setAlbums] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [isLabelsCollapsed, setIsLabelsCollapsed] = useState(true);
  const [isAlbumsCollapsed, setIsAlbumsCollapsed] = useState(true);
  const [isTracksCollapsed, setIsTracksCollapsed] = useState(true);

  useEffect(() => {
    fetch('/godspeed/labels')
      .then(res => res.json())
      .then(({ labels }) => setLabels(labels))
      .catch(err => console.error('❌ Failed to fetch labels:', err));
  }, []);

  useEffect(() => {
    if (selectedLabels.length === 0) {
      setAlbums([]);
      setTracks([]);
      return;
    }

    const labelsQuery = selectedLabels.join(',');
    fetch(`/godspeed/albums_by_labels?labels=${encodeURIComponent(labelsQuery)}&combine=${combineMode}`)
      .then(res => res.json())
      .then(data => setAlbums(data))
      .catch(err => console.error('❌ Failed to fetch albums by labels:', err));

    fetch(`/godspeed/tracks_by_labels?labels=${encodeURIComponent(labelsQuery)}&include_album_labels=false&combine=${combineMode}`)
      .then(res => res.json())
      .then(data => setTracks(data))
      .catch(err => console.error('❌ Failed to fetch tracks by labels:', err));
  }, [selectedLabels, combineMode]);

  const canCollapseLabels = labels.length <= 20;
  const canCollapseAlbums = albums.length <= 4;
  const canCollapseTracks = tracks.length <= 10;

  const toggleLabel = (label) => {
    setSelectedLabels(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const handlePlayAll = async () => {
    const queueTracks = [];
    const labelsQuery = selectedLabels.join(',');

    const sortedAlbums = [...albums].sort((a, b) => a.title.localeCompare(b.title));
    for (const album of sortedAlbums) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
      const albumTracks = await tracksRes.json();
      const formattedTracks = albumTracks.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.album_artist || album.album_artist || 'Unknown Artist',
        album: album.title,
        year: track.year || album.year || 'Unknown Year',
        duration: track.duration,
        audioSrc: `/godspeed/track/${track.id}/play`,
        albumCover: `/godspeed/album/${album.id}/cover`,
        waveformImage: track.waveform_path || "/waveforms/default.webp",
        codec: track.codec,
        bitrate: track.bitrate,
        fileSize: track.file_size,
        groupId,
      }));
      queueTracks.push(...formattedTracks);
    }

    const tracksRes = await fetch(`/godspeed/tracks_by_labels?labels=${encodeURIComponent(labelsQuery)}&include_album_labels=false&combine=${combineMode}`);
    const labeledTracks = await tracksRes.json();
    const formattedTracks = labeledTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || track.artist || 'Unknown Artist',
      album: track.album?.title || track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    queueTracks.push(...formattedTracks);

    playQueue(queueTracks, 0);
  };

  const handlePlayShuffleAll = async () => {
    const queueTracks = [];
    const labelsQuery = selectedLabels.join(',');

    const shuffledAlbums = [...albums].sort(() => Math.random() - 0.5);
    for (const album of shuffledAlbums) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
      const albumTracks = await tracksRes.json();
      const shuffledTracks = [...albumTracks].sort(() => Math.random() - 0.5);
      const formattedTracks = shuffledTracks.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.album_artist || album.album_artist || 'Unknown Artist',
        album: album.title,
        year: track.year || album.year || 'Unknown Year',
        duration: track.duration,
        audioSrc: `/godspeed/track/${track.id}/play`,
        albumCover: `/godspeed/album/${album.id}/cover`,
        waveformImage: track.waveform_path || "/waveforms/default.webp",
        codec: track.codec,
        bitrate: track.bitrate,
        fileSize: track.file_size,
        groupId,
      }));
      queueTracks.push(...formattedTracks);
    }

    const tracksRes = await fetch(`/godspeed/tracks_by_labels?labels=${encodeURIComponent(labelsQuery)}&include_album_labels=false&combine=${combineMode}`);
    const labeledTracks = await tracksRes.json();
    const shuffledTracks = [...labeledTracks].sort(() => Math.random() - 0.5);
    const formattedTracks = shuffledTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || track.artist || 'Unknown Artist',
      album: track.album?.title || track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    queueTracks.push(...formattedTracks);

    playQueue(queueTracks, 0);
  };

  const handlePlayAlbumsInOrder = async () => {
    const sortedAlbums = [...albums].sort((a, b) => a.title.localeCompare(b.title));
    const queueTracks = [];
    for (const album of sortedAlbums) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
      const albumTracks = await tracksRes.json();
      const formattedTracks = albumTracks.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.album_artist || album.album_artist || 'Unknown Artist',
        album: album.title,
        year: track.year || album.year || 'Unknown Year',
        duration: track.duration,
        audioSrc: `/godspeed/track/${track.id}/play`,
        albumCover: `/godspeed/album/${album.id}/cover`,
        waveformImage: track.waveform_path || "/waveforms/default.webp",
        codec: track.codec,
        bitrate: track.bitrate,
        fileSize: track.file_size,
        groupId,
      }));
      queueTracks.push(...formattedTracks);
    }
    playQueue(queueTracks, 0);
  };

  const handlePlayShuffleAlbum = async () => {
    const shuffledAlbums = [...albums].sort(() => Math.random() - 0.5);
    const queueTracks = [];
    for (const album of shuffledAlbums) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
      const albumTracks = await tracksRes.json();
      const shuffledTracks = [...albumTracks].sort(() => Math.random() - 0.5);
      const formattedTracks = shuffledTracks.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.album_artist || album.album_artist || 'Unknown Artist',
        album: album.title,
        year: track.year || album.year || 'Unknown Year',
        duration: track.duration,
        audioSrc: `/godspeed/track/${track.id}/play`,
        albumCover: `/godspeed/album/${album.id}/cover`,
        waveformImage: track.waveform_path || "/waveforms/default.webp",
        codec: track.codec,
        bitrate: track.bitrate,
        fileSize: track.file_size,
        groupId,
      }));
      queueTracks.push(...formattedTracks);
    }
    playQueue(queueTracks, 0);
  };

  const handlePlayAlbum = async (album) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
    const albumTracks = await tracksRes.json();
    const formattedTracks = albumTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || 'Unknown Artist',
      album: album.title,
      year: track.year || album.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    playQueue(formattedTracks, 0);
  };

  const handleShuffleAlbum = async (album) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
    const albumTracks = await tracksRes.json();
    const shuffledTracks = [...albumTracks].sort(() => Math.random() - 0.5);
    const formattedTracks = shuffledTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || 'Unknown Artist',
      album: album.title,
      year: track.year || album.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    playQueue(formattedTracks, 0);
  };

  const handlePlayTracksInOrder = () => {
    const queueTracks = tracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || track.artist || 'Unknown Artist',
      album: track.album?.title || track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    playQueue(queueTracks, 0);
  };

  const handlePlayShuffleTracks = () => {
    const shuffledTracks = [...tracks].sort(() => Math.random() - 0.5);
    const queueTracks = shuffledTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || track.artist || 'Unknown Artist',
      album: track.album?.title || track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    playQueue(queueTracks, 0);
  };

  const goToAlbum = (title) => {
    navigate(`/album?album=${encodeURIComponent(title)}`);
  };

  const goToArtist = (e, artist) => {
    e.stopPropagation();
    navigate(`/artist?artist=${encodeURIComponent(artist)}`);
  };

  const goToYear = (e, year) => {
    e.stopPropagation();
    navigate(`/year?year=${encodeURIComponent(year)}`);
  };

  return (
    <div className="main-content labels-page">
      <div className="labels-page-container">
        <div className={`labels-page-block ${canCollapseLabels && isLabelsCollapsed ? 'collapsed' : ''}`}>
          <div className="labels-page-block-header">
            {labels.length > 0 && (
              <div className="labels-page-header-actions">
                <button className="labels-page-action-button" onClick={handlePlayAll}>
                  <FaPlay /> Play
                </button>
                <button className="labels-page-action-button" onClick={handlePlayShuffleAll}>
                  <FaRandom /> Shuffle
                </button>
                <button
                  className="labels-page-combine-button"
                  onClick={() => setCombineMode(combineMode === 'and' ? 'or' : 'and')}
                  title={combineMode === 'and' ? 'Switch to OR (any label)' : 'Switch to AND (all labels)'}
                >
                  <FaMagic /> {combineMode === 'and' ? 'All' : 'Any'}
                </button>
              </div>
            )}
            {labels.length > 0 && canCollapseLabels && (
              <button
                className="labels-page-toggle-button"
                onClick={() => setIsLabelsCollapsed(!isLabelsCollapsed)}
              >
                {isLabelsCollapsed ? <FaAngleDown /> : <FaAngleUp />}
              </button>
            )}
          </div>
          <div className="labels-page-content">
            <div className="labels-page-tags">
              {labels.length > 0 ? (
                labels.map(label => (
                  <span
                    key={label.id}
                    className={`labels-page-tag ${selectedLabels.includes(label.name) ? 'selected' : ''}`}
                    onClick={() => toggleLabel(label.name)}
                  >
                    #{label.name}
                  </span>
                ))
              ) : (
                <span className="labels-page-placeholder">No labels exist</span>
              )}
            </div>
          </div>
        </div>

        <div className={`labels-page-albums-block ${canCollapseAlbums && isAlbumsCollapsed ? 'collapsed' : ''}`}>
          <div className="labels-page-block-header">
            {albums.length > 0 && (
              <div className="labels-page-header-actions">
                <button className="labels-page-action-button" onClick={handlePlayAlbumsInOrder}>
                  <FaPlay /> Play
                </button>
                <button className="labels-page-action-button" onClick={handlePlayShuffleAlbum}>
                  <FaRandom /> Shuffle
                </button>
              </div>
            )}
            {albums.length > 0 && canCollapseAlbums && (
              <button
                className="labels-page-toggle-button"
                onClick={() => setIsAlbumsCollapsed(!isAlbumsCollapsed)}
              >
                {isAlbumsCollapsed ? <FaAngleDown /> : <FaAngleUp />}
              </button>
            )}
          </div>
          <div className="labels-page-album-grid">
            {albums.length > 0 ? (
              albums.slice(0, canCollapseAlbums && isAlbumsCollapsed ? 4 : undefined).map(album => (
                <div
                  key={album.id}
                  className="labels-page-card"
                  onClick={() => goToAlbum(album.title)}
                  data-title={album.title}
                  data-artist={album.album_artist}
                >
                  <div className="labels-page-album-image-wrapper">
                    <img
                      src={`/godspeed/album/${album.id}/thumb`}
                      alt={`Cover for ${album.title}`}
                      onError={(e) => {
                        e.target.src = '/placeholder-cover.jpg';
                        e.target.onerror = null;
                      }}
                    />
                  </div>
                  <div className="labels-page-card-info">
                    <div>
                      <div className="labels-page-card-title">{album.title}</div>
                      <div
                        className="labels-page-card-artist labels-page-clickable"
                        onClick={(e) => goToArtist(e, album.album_artist || 'Unknown Artist')}
                      >
                        {album.album_artist || 'Unknown Artist'}
                      </div>
                      <div
                        className="labels-page-card-meta labels-page-clickable"
                        onClick={(e) => goToYear(e, album.year)}
                      >
                        Year: {album.year || '—'}
                      </div>
                    </div>
                    <div className="labels-page-card-buttons">
                      <button
                        className="labels-page-action-button"
                        onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                      >
                        <FaPlay /> Play
                      </button>
                      <button
                        className="labels-page-action-button"
                        onClick={(e) => { e.stopPropagation(); handleShuffleAlbum(album); }}
                      >
                        <FaRandom /> Shuffle
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <span className="labels-page-placeholder">No labeled albums exist</span>
            )}
          </div>
        </div>

        <div className={`labels-page-tracks-block ${canCollapseTracks && isTracksCollapsed ? 'collapsed' : ''}`}>
          <div className="labels-page-block-header">
            {tracks.length > 0 && (
              <div className="labels-page-header-actions">
                <button className="labels-page-action-button" onClick={handlePlayTracksInOrder}>
                  <FaPlay /> Play
                </button>
                <button className="labels-page-action-button" onClick={handlePlayShuffleTracks}>
                  <FaRandom /> Shuffle
                </button>
              </div>
            )}
            {tracks.length > 0 && canCollapseTracks && (
              <button
                className="labels-page-toggle-button"
                onClick={() => setIsTracksCollapsed(!isTracksCollapsed)}
              >
                {isTracksCollapsed ? <FaAngleDown /> : <FaAngleUp />}
              </button>
            )}
          </div>
          <div className="labels-page-tracks-table">
            {tracks.length > 0 ? (
              tracks.slice(0, canCollapseTracks && isTracksCollapsed ? 10 : undefined).map((track, index) => (
                <div
                  key={track.id}
                  className={`labels-page-tracks-row ${index === (canCollapseTracks && isTracksCollapsed ? 9 : tracks.length - 1) ? 'last' : ''}`}
                  onClick={() => {
                    const queueTracks = [{
                      id: track.id,
                      title: track.title,
                      artist: track.album_artist || track.artist || 'Unknown Artist',
                      album: track.album?.title || track.album || 'Unknown Album',
                      year: track.year || 'Unknown Year',
                      duration: track.duration,
                      audioSrc: `/godspeed/track/${track.id}/play`,
                      albumCover: `/godspeed/album/${track.album_id}/cover`,
                      waveformImage: track.waveform_path || "/waveforms/default.webp",
                      codec: track.codec,
                      bitrate: track.bitrate,
                      fileSize: track.file_size,
                    }];
                    playQueue(queueTracks, 0);
                  }}
                >
                  <div>{index + 1}</div>
                  <div>{track.title}</div>
                  <div className="labels-page-meta-group">
                    <div className="labels-page-clickable" onClick={(e) => goToArtist(e, track.artist)}>
                      {track.album_artist || track.artist || 'Unknown Artist'}
                    </div>
                    <div className="labels-page-clickable" onClick={(e) => goToAlbum(track.album?.title || track.album)}>
                      {track.album?.title || track.album || 'Unknown Album'}
                    </div>
                    <div>{formatDuration(track.duration)}</div>
                  </div>
                  <div></div>
                </div>
              ))
            ) : (
              <span className="labels-page-placeholder">No labeled tracks exist</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LabelsPage;