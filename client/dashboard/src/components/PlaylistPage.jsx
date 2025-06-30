import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { useNavigate, useParams } from "react-router-dom"; // Changed useLocation to useParams
import { createPortal } from "react-dom";
import { FaPlay, FaRandom, FaEllipsisV, FaInfoCircle, FaTags, FaTimes, FaTrash, FaEdit, FaPlus, FaSearch, FaStepForward, FaClock } from "react-icons/fa";
import { useAudioStore } from "../stores/useAudioStore";
import { useAudioEvents } from "../hooks/useAudioEvents";
import "./PlaylistPage.css";

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

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)} MB`;
}

const TrackDropdown = memo(({ track, playlist, onTrackRemove, onLabelUpdate }) => {
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

      onLabelUpdate(track.id, [...(track.labels || []), name]);
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

      onLabelUpdate(track.id, track.labels.filter(l => l !== label));
    } catch (error) {
      console.error("Failed to delete track label:", error);
    }
  };

  const formattedTrack = {
    id: track.id,
    title: track.custom_title || track.title,
    artist: track.artist || "Unknown Artist",
    album: track.album || "Unknown Album",
    year: track.year || "Unknown Year",
    duration: track.duration,
    audioSrc: `/godspeed/track/${track.id}/play`,
    albumCover: `/godspeed/album/${track.album_id}/cover`,
    waveformImage: track.waveform_path || "/waveforms/default.webp",
    codec: track.codec,
    bitrate: track.bitrate,
    fileSize: track.file_size,
  };

  return (
    <>
      <button
        ref={buttonRef}
        className="pls-track-dropdown-button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <FaEllipsisV />
      </button>

      {open &&
        createPortal(
          <div
            className={`pls-track-dropdown-menu ${showLabel ? "expanded" : ""}`}
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
              className="pls-track-dropdown-icon"
              title="Next"
              onClick={(e) => {
                e.stopPropagation();
                queueNext(formattedTrack);
              }}
            >
              <FaStepForward />
            </button>
            <button
              className="pls-track-dropdown-icon"
              title="Later"
              onClick={(e) => {
                e.stopPropagation();
                queueLater(formattedTrack);
              }}
            >
              <FaClock />
            </button>
            <div
              className="pls-track-info-wrapper"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              title="Info"
            >
              <FaInfoCircle />
              {showInfo && (
                <div className="pls-track-info-tooltip">
                  <table>
                    <tbody>
                      <tr>
                        <td>Duration:</td>
                        <td>{formatDuration(track.duration)}</td>
                      </tr>
                      <tr>
                        <td>Size:</td>
                        <td>{formatFileSize(track.file_size)}</td>
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
              className="pls-label-wrapper"
              onMouseEnter={() => setShowLabel(true)}
              onMouseLeave={() => setShowLabel(false)}
              title="Add Label"
            >
              <div className="pls-track-dropdown-icon">
                <FaTags />
              </div>
              {showLabel && (
                <div className="pls-label-popup">
                  {track.labels?.length > 0 && (
                    <div className="pls-label-tags-inline">
                      {track.labels.map((label, i) => (
                        <span key={i} className="pls-label-tag-inline">
                          #{label}
                          <button
                            className="pls-label-delete-button"
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
                    className="pls-track-label-input"
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

function PlaylistPage() {
  const navigate = useNavigate();
  const { id } = useParams(); // Use useParams to get the playlist ID from the route
  const { playQueue, queueNextBatch, queueLaterBatch, currentTrackId, initializeAudio, audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration } = useAudioStore();
  useAudioEvents(audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration);

  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [newPlaylistCover, setNewPlaylistCover] = useState(null); // Added missing state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [editingTrackTitle, setEditingTrackTitle] = useState("");

  useEffect(() => {
    initializeAudio();
  }, [initializeAudio]);

  useEffect(() => {
    if (!id) {
      setSelectedPlaylist(null);
      setTracks([]);
      setLoading(false);
      return;
    }

    const fetchPlaylistData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/godspeed/playlists/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Playlist not found: ${id}`);
          }
          throw new Error('Failed to fetch playlist');
        }
        const data = await res.json();
        if (!data || !data.id) {
          throw new Error(`Invalid playlist data for ID: ${id}`);
        }
        setSelectedPlaylist(data);
        setTracks(data.tracks || []);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch playlist:', error);
        setError(error.message || 'Failed to load playlist. Please try again.');
        setLoading(false);
      }
    };

    fetchPlaylistData();
  }, [id]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const fetchSearchResults = async () => {
      try {
        const res = await fetch(`/godspeed/tracks?search=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error('Failed to search tracks');
        const data = await res.json();
        setSearchResults(data);
      } catch (error) {
        console.error('Failed to search tracks:', error);
        setError('Failed to search tracks. Please try again.');
      }
    };

    const debounce = setTimeout(fetchSearchResults, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleUpdatePlaylist = async () => {
    if (!editingPlaylist || !editingPlaylist.name.trim()) return;

    try {
      setLoading(true);
      const res = await fetch(`/godspeed/playlists/${editingPlaylist.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingPlaylist.name, description: editingPlaylist.description }),
      });
      if (!res.ok) throw new Error('Failed to update playlist');

      if (newPlaylistCover) {
        const formData = new FormData();
        formData.append('cover', newPlaylistCover);
        const coverRes = await fetch(`/godspeed/playlists/${editingPlaylist.id}/cover`, {
          method: 'POST',
          body: formData,
        });
        if (!coverRes.ok) throw new Error('Failed to upload cover');
        const coverData = await coverRes.json();
        editingPlaylist.cover_path = coverData.cover_path;
      }

      setSelectedPlaylist({ ...selectedPlaylist, ...editingPlaylist });
      setEditingPlaylist(null);
      setNewPlaylistCover(null);
      setSearchQuery("");
      setSearchResults([]);
      setLoading(false);
    } catch (error) {
      console.error('Failed to update playlist:', error);
      setError('Failed to update playlist. Please try again.');
      setLoading(false);
    }
  };

  const handleDeletePlaylist = async (id) => {
    try {
      const res = await fetch(`/godspeed/playlists/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete playlist');
      navigate('/playlists');
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      setError('Failed to delete playlist. Please try again.');
    }
  };

  const handleAddTrackToPlaylist = async (playlistId, trackId) => {
    try {
      const res = await fetch('/godspeed/playlist_tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId, track_id: trackId }),
      });
      if (!res.ok) throw new Error('Failed to add track to playlist');
      if (selectedPlaylist?.id === playlistId) {
        const trackRes = await fetch(`/godspeed/tracks?track_id=${trackId}`);
        if (!trackRes.ok) throw new Error('Failed to fetch track');
        const track = await trackRes.json();
        setTracks([...tracks, { ...track, custom_title: track.title }]);
      }
    } catch (error) {
      console.error('Failed to add track to playlist:', error);
      setError('Failed to add track to playlist. Please try again.');
    }
  };

  const handleQueueAction = useCallback((shuffle = false, next = false, later = false) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const queueTracks = tracks.map((track) => ({
      id: track.id,
      title: track.custom_title || track.title,
      artist: track.artist || "Unknown Artist",
      album: track.album || "Unknown Album",
      year: track.year || "Unknown Year",
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    if (shuffle) {
      queueTracks.sort(() => Math.random() - 0.5);
      playQueue(queueTracks, 0);
    } else if (next) {
      queueNextBatch(queueTracks);
    } else if (later) {
      queueLaterBatch(queueTracks);
    } else {
      playQueue(queueTracks, 0);
    }
  }, [tracks, playQueue, queueNextBatch, queueLaterBatch]);

  const togglePlay = useCallback((index) => {
    if (!tracks[index]) return;

    const queueTracks = tracks.map((track) => ({
      id: track.id,
      title: track.custom_title || track.title,
      artist: track.artist || "Unknown Artist",
      album: track.album || "Unknown Album",
      year: track.year || "Unknown Year",
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${track.album_id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
    }));
    playQueue(queueTracks, index);
  }, [tracks, playQueue]);

  const handlePlaylistLabelAdd = async (e) => {
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

        const playlistLabelRes = await fetch('/godspeed/playlist_labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: selectedPlaylist.id, label_id: labelId }),
        });
        if (!playlistLabelRes.ok) throw new Error('Failed to associate label with playlist');
      }

      setSelectedPlaylist(prev => ({
        ...prev,
        labels: Array.from(new Set([...(prev.labels || []), ...newLabels])),
      }));
      e.target.value = "";
    } catch (error) {
      console.error("Failed to add playlist labels:", error);
    }
  };

  const handlePlaylistLabelDelete = async (label) => {
    try {
      const labelRes = await fetch('/godspeed/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label.toLowerCase() }),
      });
      if (!labelRes.ok) throw new Error('Failed to fetch label');
      const { id: labelId } = await labelRes.json();

      const deleteRes = await fetch('/godspeed/playlist_labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: selectedPlaylist.id, label_id: labelId }),
      });
      if (!deleteRes.ok) throw new Error('Failed to delete playlist label');

      setSelectedPlaylist(prev => ({
        ...prev,
        labels: prev.labels.filter(l => l !== label),
      }));
    } catch (error) {
      console.error("Failed to delete playlist label:", error);
    }
  };

  const handleTrackRemove = useCallback(async (trackId) => {
    try {
      const res = await fetch('/godspeed/playlist_tracks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: selectedPlaylist.id, track_id: trackId }),
      });
      if (!res.ok) throw new Error('Failed to remove track');
      setTracks(prev => prev.filter(t => t.id !== trackId));
    } catch (error) {
      console.error("Failed to remove track:", error);
      setError('Failed to remove track. Please try again.');
    }
  }, [selectedPlaylist]);

  const handleTrackRename = useCallback(async (trackId, newTitle) => {
    try {
      const res = await fetch(`/godspeed/playlist_tracks/${selectedPlaylist.id}/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_title: newTitle }),
      });
      if (!res.ok) throw new Error('Failed to rename track');
      setTracks(prev =>
        prev.map(t => t.id === trackId ? { ...t, custom_title: newTitle } : t)
      );
      setEditingTrackId(null);
    } catch (error) {
      console.error("Failed to rename track:", error);
      setError('Failed to rename track. Please try again.');
    }
  }, [selectedPlaylist]);

  const handleTrackLabelUpdate = useCallback((trackId, updatedLabels) => {
    setTracks(prev =>
      prev.map(t => t.id === trackId ? { ...t, labels: updatedLabels } : t)
    );
  }, []);

  const goToLabel = useCallback((e, label) => {
    e.stopPropagation();
    navigate(`/labels?label=${encodeURIComponent(label)}`);
  }, [navigate]);

  const goToAlbum = useCallback((e, title) => {
    e.stopPropagation();
    navigate(`/album?album=${encodeURIComponent(title)}`);
  }, [navigate]);

  const goToArtist = useCallback((e, artist) => {
    e.stopPropagation();
    navigate(`/artist?artist=${encodeURIComponent(artist)}`);
  }, [navigate]);

  if (loading) return <div className="main-content">Loading playlist...</div>;
  if (error) return <div className="main-content error">{error}</div>;
  if (!selectedPlaylist) return <div className="main-content">No playlist selected</div>;

  return (
    <div className="main-content pls-page">
      <div className="pls-container">
        <div className="pls-detail-section">
          <div className="pls-header-block">
            <img
              className="pls-cover"
              src={`/godspeed/playlists/${selectedPlaylist.id}/cover`}
              alt={selectedPlaylist.name}
              onError={(e) => {
                e.target.src = '/placeholder-cover.jpg';
                e.target.onerror = null;
              }}
            />
            <div className="pls-info-block">
              {editingPlaylist ? (
                <>
                  <input
                    type="text"
                    value={editingPlaylist.name}
                    onChange={(e) => setEditingPlaylist({ ...editingPlaylist, name: e.target.value })}
                    className="pls-input"
                  />
                  <textarea
                    value={editingPlaylist.description}
                    onChange={(e) => setEditingPlaylist({ ...editingPlaylist, description: e.target.value })}
                    className="pls-textarea"
                    placeholder="Description"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewPlaylistCover(e.target.files[0])}
                    className="pls-file-input"
                  />
                  <div className="pls-search-container">
                    <FaSearch className="pls-search-icon" />
                    <input
                      type="text"
                      placeholder="Search for songs to add..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pls-search-input"
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="pls-search-results">
                      <div className="pls-search-results-header">
                        <div>Action</div>
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
                      {searchResults.map((track) => (
                        <div
                          key={track.id}
                          className="pls-search-results-row"
                          onClick={() => togglePlay(idx)}
                        >
                          <div>
                            <button
                              className="pls-add-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTrackToPlaylist(selectedPlaylist.id, track.id);
                              }}
                              disabled={tracks.some(t => t.id === track.id)}
                            >
                              <FaPlus />
                            </button>
                          </div>
                          <div>{track.title}</div>
                          <div className="meta-group">
                            <div>{formatDuration(track.duration)}</div>
                            <div>{formatFileSize(track.file_size)}</div>
                            <div>{track.codec || "Unknown"}</div>
                            <div>{track.bitrate ? Math.round(track.bitrate / 1000) + " kbps" : "-"}</div>
                            <div>{track.play_count || 0}</div>
                          </div>
                          <div>
                            <TrackDropdown
                              track={track}
                              playlist={selectedPlaylist}
                              onTrackRemove={handleTrackRemove}
                              onLabelUpdate={handleTrackLabelUpdate}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pls-actions">
                    <button
                      className="pls-action-button"
                      onClick={handleUpdatePlaylist}
                      disabled={!editingPlaylist.name.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="pls-action-button"
                      onClick={() => {
                        setEditingPlaylist(null);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="pls-action-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaylist(selectedPlaylist.id);
                      }}
                    >
                      <FaTrash /> Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pls-header-title">
                    <h2>{selectedPlaylist.name}</h2>
                    <button
                      className="pls-edit-icon"
                      onClick={() => setEditingPlaylist({ id: selectedPlaylist.id, name: selectedPlaylist.name, description: selectedPlaylist.description })}
                      title="Edit Playlist"
                    >
                      <FaEdit />
                    </button>
                  </div>
                  <div className="pls-meta-row">
                    <p>
                      {formatDate(selectedPlaylist.created_at)} • {formatTime(selectedPlaylist.created_at)} • {selectedPlaylist.track_count} track{selectedPlaylist.track_count !== 1 ? 's' : ''} • {formatDuration(tracks.reduce((sum, t) => sum + (t.duration || 0), 0))} • {formatFileSize(tracks.reduce((sum, t) => sum + (t.file_size || 0), 0))}
                    </p>
                  </div>
                  <p className="pls-description">{selectedPlaylist.description || 'No description'}</p>
                  <div className="pls-labels">
                    <div className="pls-label-tags">
                      {selectedPlaylist.labels?.length > 0 ? (
                        selectedPlaylist.labels.map((label, i) => (
                          <span
                            className="pls-label-tag"
                            key={i}
                            onClick={(e) => goToLabel(e, label)}
                          >
                            #{label}
                            <button
                              className="pls-label-delete-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlaylistLabelDelete(label);
                              }}
                              title="Remove Label"
                            >
                              <FaTimes />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="pls-label-placeholder">No labels</span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="pls-label-input"
                      placeholder="Add labels"
                      onBlur={handlePlaylistLabelAdd}
                      onKeyDown={handlePlaylistLabelAdd}
                    />
                  </div>
                  <div className="pls-actions">
                    <button className="pls-action-button" onClick={() => handleQueueAction()}>
                      <FaPlay /> Play
                    </button>
                    <button className="pls-action-button" onClick={() => handleQueueAction(true)}>
                      <FaRandom /> Shuffle
                    </button>
                    <button className="pls-action-button" onClick={() => handleQueueAction(false, true, false)}>
                      <FaStepForward /> Next
                    </button>
                    <button className="pls-action-button" onClick={() => handleQueueAction(false, false, true)}>
                      <FaClock /> Later
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className={`pls-page-tracks-table ${editingPlaylist ? 'editing' : ''}`}>
            <div className="pls-tracks-header">
              <div>No.</div>
              <div>Title</div>
              <div className="pls-meta-group">
                <div>Duration</div>
                <div>Size</div>
                <div>Codec</div>
                <div>Bitrate</div>
                <div>Plays</div>
              </div>
              <div>{editingPlaylist ? 'Remove' : ''}</div>
            </div>
            {tracks.length > 0 ? (
              tracks.map((track, idx) => (
                <div
                  className={`pls-tracks-row ${track.id === currentTrackId && !editingPlaylist ? "playing" : ""}`}
                  key={track.id}
                  onClick={() => !editingPlaylist && togglePlay(idx)}
                  onMouseEnter={() => editingPlaylist && setHoveredTrackId(track.id)}
                  onMouseLeave={() => editingPlaylist && setHoveredTrackId(null)}
                >
                  <div>{idx + 1}</div>
                  <div className="pls-track-title-cell">
                    {editingTrackId === track.id && editingPlaylist ? (
                      <input
                        type="text"
                        value={editingTrackTitle}
                        onChange={(e) => setEditingTrackTitle(e.target.value)}
                        onBlur={() => handleTrackRename(track.id, editingTrackTitle.trim())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleTrackRename(track.id, editingTrackTitle.trim());
                          } else if (e.key === 'Escape') {
                            setEditingTrackId(null);
                          }
                        }}
                        className="pls-track-title-input"
                        autoFocus
                      />
                    ) : (
                      <div className="pls-track-title-wrapper">
                        <span
                          className="pls-track-title-text"
                          onClick={(e) => {
                            if (editingPlaylist) {
                              e.stopPropagation();
                              setEditingTrackId(track.id);
                              setEditingTrackTitle(track.custom_title || track.title);
                            }
                          }}
                        >
                          {track.custom_title || track.title}
                        </span>
                        {editingPlaylist && hoveredTrackId === track.id && (
                          <div className="pls-track-title-tooltip">Click to edit</div>
                        )}
                        <div className="pls-track-meta-text">
                          <span
                            className="pls-clickable"
                            onClick={(e) => goToArtist(e, track.artist || "Unknown Artist")}
                          >
                            {track.artist || "Unknown Artist"}
                          </span>
                          <span> • </span>
                          <span
                            className="pls-clickable"
                            onClick={(e) => goToAlbum(e, track.album || "Unknown Album")}
                          >
                            {track.album || "Unknown Album"}
                          </span>
                          {track.custom_title && track.custom_title !== track.title && (
                            <>
                              <span> • </span>
                              <span className="pls-clickable">{track.title}</span>
                            </>
                          )}
                          {track.labels?.length > 0 && (
                            <>
                              <span> • </span>
                              {track.labels.map((label, i) => (
                                <span
                                  key={i}
                                  className="pls-clickable"
                                  onClick={(e) => goToLabel(e, label)}
                                >
                                  #{label}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="pls-meta-group">
                    <div>{formatDuration(track.duration)}</div>
                    <div>{formatFileSize(track.file_size)}</div>
                    <div>{track.codec || "Unknown"}</div>
                    <div>{track.bitrate ? Math.round(track.bitrate / 1000) + " kbps" : "-"}</div>
                    <div>{track.play_count || 0}</div>
                  </div>
                  <div>
                    {editingPlaylist ? (
                      <button
                        className="pls-track-remove-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrackRemove(track.id);
                        }}
                      >
                        <FaTrash />
                      </button>
                    ) : (
                      <TrackDropdown
                        track={track}
                        playlist={selectedPlaylist}
                        onTrackRemove={handleTrackRemove}
                        onLabelUpdate={handleTrackLabelUpdate}
                      />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <span className="pls-page-placeholder">No tracks in this playlist</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaylistPage;