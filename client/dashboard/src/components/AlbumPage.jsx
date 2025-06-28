import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import "./albumpage.css";
import lastfmIcon from "./last_ico.ico";
import { FaPlay, FaRandom, FaStepForward, FaClock, FaEllipsisV, FaInfoCircle, FaTags, FaTimes } from "react-icons/fa";
import { useAudioStore } from "../stores/useAudioStore";
import { useAudioEvents } from "../hooks/useAudioEvents";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

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

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="main-content error">
          <h2>Something went wrong.</h2>
          <p>{this.state.error?.message || "Unknown error"}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TrackDropdown = memo(({ track, album, onLabelDelete }) => {
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const { queueNext, queueLater } = useAudioStore();

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  }, [open]);

  const handleAddTrackLabel = async (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    const newLabel = e.target.value.trim();
    if (!newLabel) return;

    try {
      const labelRes = await fetch('/godspeed/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLabel.toLowerCase() }),
      });
      if (!labelRes.ok) throw new Error('Failed to add label');
      const { id: labelId, name } = await labelRes.json();

      const trackLabelRes = await fetch('/godspeed/track_labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id, label_id: labelId }),
      });
      if (!trackLabelRes.ok) throw new Error('Failed to associate label with track');

      track.labels = Array.from(new Set([...(track.labels || []), name]));
      e.target.value = "";
    } catch (error) {
      console.error("Failed to add track label:", error);
    }
  };

  const handleDeleteTrackLabel = async (label) => {
    try {
      const labelRes = await fetch('/godspeed/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label.toLowerCase() }),
      });
      if (!labelRes.ok) throw new Error('Failed to fetch label');
      const { id: labelId } = await labelRes.json();

      const deleteRes = await fetch('/godspeed/track_labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id, label_id: labelId }),
      });
      if (!deleteRes.ok) throw new Error('Failed to delete track label');

      track.labels = track.labels.filter(l => l !== label);
      onLabelDelete(track.id, track.labels);
    } catch (error) {
      console.error("Failed to delete track label:", error);
    }
  };

  const formattedTrack = {
    id: track.id,
    title: track.title,
    artist: track.album_artist || album.album_artist || "Unknown Artist",
    album: album.title,
    year: track.year || album.year || "Unknown Year",
    duration: track.duration,
    audioSrc: `/godspeed/track/${track.id}/play`,
    albumCover: `/godspeed/album/${album.id}/cover`,
    waveformImage: track.waveform_path || "/waveforms/default.webp",
    codec: track.codec,
    bitrate: track.bitrate,
    fileSize: track.file_size,
  };

  return (
    <>
      <button
        ref={buttonRef}
        className="track-dropdown-button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <FaEllipsisV />
      </button>

      {open &&
        createPortal(
          <div
            className={`track-dropdown-menu ${showLabel ? "expanded" : ""}`}
            style={{
              position: "absolute",
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => {
              setOpen(false);
              setShowInfo(false);
              setShowLabel(false);
            }}
          >
            <button
              className="track-dropdown-icon"
              title="Next"
              onClick={(e) => {
                e.stopPropagation();
                queueNext(formattedTrack);
              }}
            >
              <FaStepForward />
            </button>
            <button
              className="track-dropdown-icon"
              title="Later"
              onClick={(e) => {
                e.stopPropagation();
                queueLater(formattedTrack);
              }}
            >
              <FaClock />
            </button>

            <div
              className="track-dropdown-icon info-wrapper"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              title="Info"
            >
              <FaInfoCircle />
              {showInfo && (
                <div className="track-info-tooltip">
                  <table>
                    <tbody>
                      <tr>
                        <td>Duration:</td>
                        <td>{formatDuration(track.duration)}</td>
                      </tr>
                      <tr>
                        <td>Size:</td>
                        <td>{Math.round((track.file_size || 0) / 1024 / 1024)} MB</td>
                      </tr>
                      <tr>
                        <td>Codec:</td>
                        <td>{track.codec || "Unknown"}</td>
                      </tr>
                      <tr>
                        <td>Bitrate:</td>
                        <td>{track.bitrate ? Math.round(track.bitrate / 1000) + " kbps" : "-"}</td>
                      </tr>
                      <tr>
                        <td>Plays:</td>
                        <td>{track.play_count || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="label-wrapper"
              onMouseEnter={() => setShowLabel(true)}
              onMouseLeave={() => setShowLabel(false)}
              title="Add Label"
            >
              <div className="track-dropdown-icon">
                <FaTags />
              </div>

              {showLabel && (
                <div className="label-popup">
                  {track.labels?.length > 0 && (
                    <div className="label-tags-inline">
                      {track.labels.map((label, i) => (
                        <span key={i} className="label-tag-inline">
                          #{label}
                          <button
                            className="label-delete-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTrackLabel(label);
                            }}
                            title="Remove Label"
                          >
                            <FaTimes />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Add label"
                    className="track-label-input"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={handleAddTrackLabel}
                    onKeyDown={handleAddTrackLabel}
                  />
                </div>
              )}
            </div>
          </div>,
          getDropdownRoot()
        )}
    </>
  );
});

function getDropdownRoot() {
  let container = document.getElementById("dropdown-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "dropdown-root";
    document.body.appendChild(container);
  }
  return container;
}

function AlbumPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useQuery();
  const albumTitle = params.get("album");

  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const {
    playQueue,
    queueNextBatch,
    queueLaterBatch,
    currentTrackId,
    initializeAudio,
    audioRef,
    currentTrack,
    currentPlaySessionRef,
    isPlaying,
    playNext,
    setProgress,
    setDuration
  } = useAudioStore();

  useAudioEvents(audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration);

  useEffect(() => {
    initializeAudio();
  }, [initializeAudio]);

  useEffect(() => {
    if (!albumTitle) {
      setError("No album specified");
      setLoading(false);
      return;
    }

    const fetchAlbumData = async () => {
      try {
        setLoading(true);
        const albumsRes = await fetch('/godspeed/albums');
        if (!albumsRes.ok) throw new Error('Failed to fetch albums');
        const albums = await albumsRes.json();
        const found = albums.find(a => a.title.toLowerCase() === albumTitle.toLowerCase());
        if (!found) {
          throw new Error(`Album not found: ${albumTitle}`);
        }

        const labelsRes = await fetch(`/godspeed/album_labels/${found.id}`);
        if (!labelsRes.ok) throw new Error('Failed to fetch album labels');
        const { labels } = await labelsRes.json();

        const tracksRes = await fetch(`/godspeed/tracks?album_id=${found.id}`);
        if (!tracksRes.ok) throw new Error('Failed to fetch tracks');
        const tracksData = await tracksRes.json();
        const updatedTracks = await Promise.all(
          tracksData.map(async track => {
            const trackLabelsRes = await fetch(`/godspeed/track_labels/${track.id}`);
            const { labels } = await trackLabelsRes.json();
            return { ...track, labels: labels.map(l => l.name) };
          })
        );

        setAlbum({ ...found, labels: labels.map(l => l.name) });
        setTracks(updatedTracks);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch album data:", error);
        setError("Failed to load album. Please try again.");
        setLoading(false);
      }
    };

    fetchAlbumData();
  }, [albumTitle]);

  const handleQueueAction = useCallback((shuffle = false, next = false, later = false) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const queueTracks = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || "Unknown Artist",
      album: album.title,
      year: track.year || album.year || "Unknown Year",
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    if (shuffle) {
      queueTracks.sort(() => Math.random() - 0.5);
      console.log("Shuffling queue:", queueTracks);
      playQueue(queueTracks, 0);
    } else if (next) {
      console.log("Queuing next:", queueTracks);
      queueNextBatch(queueTracks);
    } else if (later) {
      console.log("Queuing later:", queueTracks);
      queueLaterBatch(queueTracks);
    } else {
      console.log("Playing queue:", queueTracks);
      playQueue(queueTracks, 0);
    }
  }, [album, tracks, playQueue, queueNextBatch, queueLaterBatch]);

  const togglePlay = useCallback((index) => {
    if (!tracks[index]) return;

    const queueTracks = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || "Unknown Artist",
      album: album.title,
      year: track.year || album.year || "Unknown Year",
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    console.log("Playing track at index:", index, queueTracks[index]);
    playQueue(queueTracks, index);
  }, [album, tracks, playQueue]);

  const handleAlbumLabelAdd = async (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    const newLabels = e.target.value
      .split(",")
      .map(l => l.trim().toLowerCase())
      .filter(Boolean);
    if (newLabels.length === 0) return;

    try {
      for (const label of newLabels) {
        const labelRes = await fetch('/godspeed/labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: label }),
        });
        if (!labelRes.ok) throw new Error('Failed to add label');
        const { id: labelId } = await labelRes.json();

        const albumLabelRes = await fetch('/godspeed/album_labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ album_id: album.id, label_id: labelId }),
        });
        if (!albumLabelRes.ok) throw new Error('Failed to associate label with album');
      }

      setAlbum(prev => ({
        ...prev,
        labels: Array.from(new Set([...(prev.labels || []), ...newLabels])),
      }));
      e.target.value = "";
    } catch (error) {
      console.error("Failed to add album labels:", error);
    }
  };

  const handleAlbumLabelDelete = async (label) => {
    try {
      const labelRes = await fetch('/godspeed/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label.toLowerCase() }),
      });
      if (!labelRes.ok) throw new Error('Failed to fetch label');
      const { id: labelId } = await labelRes.json();

      const deleteRes = await fetch('/godspeed/album_labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, label_id: labelId }),
      });
      if (!deleteRes.ok) throw new Error('Failed to delete album label');

      setAlbum(prev => ({
        ...prev,
        labels: prev.labels.filter(l => l !== label),
      }));
    } catch (error) {
      console.error("Failed to delete album label:", error);
    }
  };

  const handleTrackLabelUpdate = useCallback((trackId, updatedLabels) => {
    setTracks(prev =>
      prev.map(t => (t.id === trackId ? { ...t, labels: updatedLabels } : t))
    );
  }, []);

  const goToLabel = useCallback((e, label) => {
    e.stopPropagation();
    navigate(`/labels?label=${encodeURIComponent(label)}`);
  }, [navigate]);

  if (loading) return <div className="main-content">Loading album...</div>;
  if (error) return <div className="main-content error">{error}</div>;
  if (!album) return <div className="main-content">Album not found</div>;

  return (
    <ErrorBoundary>
      <div className="main-content album-list-section">
        <div className="album-container">
          <div className="album-header-block">
            <img
              className="album-cover"
              src={`/godspeed/album/${album.id}/cover`}
              alt={album.title}
              onError={(e) => {
                e.target.src = '/placeholder-cover.jpg';
                e.target.onerror = null;
              }}
            />
            <div className="album-info-block">
              <h2>{album.title}</h2>
              <div className="album-meta-row">
                <p>
                  <span
                    className="clickable-artist-albumpage"
                    onClick={() => navigate(`/artist?artist=${encodeURIComponent(album.album_artist || 'Unknown Artist')}`)}
                  >
                    {album.album_artist || "Unknown Artist"}
                  </span>{" "}
                  •{" "}
                  <span
                    className="clickable-year-albumpage"
                    onClick={() => navigate(`/year?year=${encodeURIComponent(album.year || 'Unknown Year')}`)}
                  >
                    {album.year || "Unknown Year"}
                  </span>{" "}
                  • {tracks.length} tracks • {formatDuration(album.duration)}
                </p>
                <a
                  href={`https://www.last.fm/music/${encodeURIComponent(
                    album.album_artist || "Unknown Artist"
                  )}/${encodeURIComponent(album.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Last.fm"
                >
                  <img className="lastfm-icon" src={lastfmIcon} alt="Last.fm" />
                </a>
              </div>

              <div className="album-labels">
                <div className="label-tags">
                  {album.labels?.length > 0 ? (
                    album.labels.map((label, i) => (
                      <span
                        className="label-tag clickable-label-albumpage"
                        key={i}
                        onClick={(e) => goToLabel(e, label)}
                      >
                        #{label}
                        <button
                          className="label-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAlbumLabelDelete(label);
                          }}
                          title="Remove Label"
                        >
                          <FaTimes />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="label-placeholder">No labels</span>
                  )}
                </div>
                <input
                  type="text"
                  className="label-input"
                  placeholder="Add labels"
                  onBlur={handleAlbumLabelAdd}
                  onKeyDown={handleAlbumLabelAdd}
                />
              </div>

              <div className="album-actions">
                <button className="album-action-button" onClick={() => handleQueueAction()}>
                  <FaPlay /> Play
                </button>
                <button className="album-action-button" onClick={() => handleQueueAction(true)}>
                  <FaRandom /> Shuffle
                </button>
                <button className="album-action-button" onClick={() => handleQueueAction(false, true, false)}>
                  <FaStepForward /> Next
                </button>
                <button className="album-action-button" onClick={() => handleQueueAction(false, false, true)}>
                  <FaClock /> Later
                </button>
              </div>
            </div>
          </div>

          <div className="tracks-table">
            <div className="tracks-header">
              <div>No.</div>
              <div>Title</div>
              <div className="meta-group">
                <div>Duration</div>
                <div>Size</div>
                <div>Codec</div>
                <div>Bitrate</div>
                <div>Plays</div>
              </div>
              <div></div>
            </div>
            {tracks.map((track, idx) => (
              <div
                className={`tracks-row ${track.id === currentTrackId ? "playing" : ""}`}
                key={track.id}
                onClick={() => togglePlay(idx)}
              >
                <div>{track.track_number || idx + 1}</div>
                <div className="track-title-cell">{track.title}</div>
                <div className="meta-group">
                  <div>{formatDuration(track.duration)}</div>
                  <div>{Math.round((track.file_size || 0) / 1024 / 1024)} MB</div>
                  <div>{track.codec || "Unknown"}</div>
                  <div>{track.bitrate ? Math.round(track.bitrate / 1000) + " kbps" : "-"}</div>
                  <div>{track.play_count || 0}</div>
                </div>
                <TrackDropdown
                  track={track}
                  album={album}
                  onLabelDelete={handleTrackLabelUpdate}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default memo(AlbumPage);