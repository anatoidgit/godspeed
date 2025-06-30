import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlay, FaRandom, FaTrash, FaPlus, FaSearch } from "react-icons/fa";
import { useAudioStore } from "../stores/useAudioStore";
import "./PlaylistsPage.css";

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

function formatFileSize(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)} MB`;
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

function PlaylistsPage() {
  const navigate = useNavigate();
  const { playQueue } = useAudioStore();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [newPlaylistCover, setNewPlaylistCover] = useState(null);
  const [newPlaylistTracks, setNewPlaylistTracks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        setLoading(true);
        const res = await fetch('/godspeed/playlists');
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to fetch playlists');
        }
        const data = await res.json();
        setPlaylists(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch playlists:', error);
        setError(error.message || 'Failed to load playlists. Please try again.');
        setLoading(false);
      }
    };

    fetchPlaylists();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const fetchSearchResults = async () => {
      try {
        const res = await fetch(`/godspeed/tracks?search=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to search tracks');
        }
        const data = await res.json();
        setSearchResults(data);
      } catch (error) {
        console.error('Failed to search tracks:', error);
        setError(error.message || 'Failed to search tracks. Please try again.');
      }
    };

    const debounce = setTimeout(fetchSearchResults, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      setError('Playlist name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/godspeed/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName, description: newPlaylistDescription || '' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create playlist');
      }

      const newPlaylist = await res.json();

      if (newPlaylistCover) {
        const formData = new FormData();
        formData.append('cover', newPlaylistCover);
        const coverRes = await fetch(`/godspeed/playlists/${newPlaylist.id}/cover`, {
          method: 'POST',
          body: formData,
        });
        if (!coverRes.ok) {
          const coverError = await coverRes.json();
          throw new Error(coverError.error || 'Failed to upload cover');
        }
        const coverData = await coverRes.json();
        newPlaylist.cover_path = coverData.cover_path;
      }

      for (const track of newPlaylistTracks) {
        const trackRes = await fetch('/godspeed/playlist_tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: newPlaylist.id, track_id: track.id }),
        });
        if (!trackRes.ok) {
          const trackError = await trackRes.json();
          throw new Error(trackError.error || 'Failed to add track to playlist');
        }
      }

      setPlaylists([{ ...newPlaylist, track_count: newPlaylistTracks.length, created_at: new Date().toISOString() }, ...playlists]);
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setNewPlaylistCover(null);
      setNewPlaylistTracks([]);
      setSearchQuery("");
      setSearchResults([]);
      setLoading(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
      setError(error.message || 'Failed to create playlist. Please try again.');
      setLoading(false);
    }
  };

  const handleDeletePlaylist = async (id) => {
    try {
      const res = await fetch(`/godspeed/playlists/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete playlist');
      }
      setPlaylists(playlists.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      setError(error.message || 'Failed to delete playlist. Please try again.');
    }
  };

  const handleAddTrackToNewPlaylist = (track) => {
    if (!newPlaylistTracks.some(t => t.id === track.id)) {
      setNewPlaylistTracks([...newPlaylistTracks, { ...track, custom_title: track.title }]);
    }
  };

  const handleRemoveTrackFromNewPlaylist = (trackId) => {
    setNewPlaylistTracks(newPlaylistTracks.filter(t => t.id !== trackId));
  };

  const handlePlayAll = async () => {
    try {
      const queueTracks = [];
      for (const playlist of playlists) {
        const groupId = Math.random().toString(36).substr(2, 9);
        const res = await fetch(`/godspeed/playlists/${playlist.id}`);
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to fetch playlist tracks');
        }
        const data = await res.json();
        const formattedTracks = data.tracks.map(track => ({
          id: track.id,
          title: track.custom_title || track.title,
          artist: track.artist || "Unknown Artist",
          album: track.album || "Unknown Album",
          year: track.year || "Unknown Year",
          duration: track.rating,
          audioSrc: `/godspeed/track/${track.id}/play`,
          albumCover: `/godspeed/album/${track.album_id}/cover`,
          waveformImage: track.waveform_path || "/waveforms/default.webp",
          codec: track.codec,
          bitrate: track.bitrate,
          fileSize: track.file_size,
          groupId,
        }));
        queueTracks.push(...formattedTracks);
      }
      playQueue(queueTracks, 0);
    } catch (error) {
      console.error('Failed to play all playlists:', error);
      setError(error.message || 'Failed to play all playlists. Please try again.');
    }
  };

  const handlePlayShuffleAll = async () => {
    try {
      const queueTracks = [];
      for (const playlist of playlists) {
        const groupId = Math.random().toString(36).substr(2, 9);
        const res = await fetch(`/godspeed/playlists/${playlist.id}`);
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to fetch playlist tracks');
        }
        const data = await res.json();
        const formattedTracks = data.tracks.map(track => ({
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
        queueTracks.push(...formattedTracks);
      }
      queueTracks.sort(() => Math.random() - 0.5);
      playQueue(queueTracks, 0);
    } catch (error) {
      console.error('Failed to shuffle all playlists:', error);
      setError(error.message || 'Failed to shuffle all playlists. Please try again.');
    }
  };

  const togglePlaySearchTrack = useCallback((track) => {
    const queueTrack = [{
      id: track.id,
      title: track.title,
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
    }];
    playQueue(queueTrack, 0);
  }, [playQueue]);

  if (loading) return <div className="main-content">Loading playlists...</div>;
  if (error) return (
    <div className="main-content error">
      <h2>Error</h2>
      <p>{error}</p>
      <button onClick={() => window.location.reload()}>Reload Page</button>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="main-content pls-page">
        <div className="pls-container">
          <div className="pls-create-block">
            <div className="pls-block-header">
              <h2>Create New Playlist</h2>
            </div>
            <div className="pls-create-form">
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="pls-input"
              />
              <textarea
                placeholder="Description (optional)"
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                className="pls-textarea"
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
                      onClick={() => togglePlaySearchTrack(track)}
                    >
                      <div>
                        <button
                          className="pls-add-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddTrackToNewPlaylist(track);
                          }}
                          disabled={newPlaylistTracks.some(t => t.id === track.id)}
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
                      <div></div>
                    </div>
                  ))}
                </div>
              )}
              {newPlaylistTracks.length > 0 && (
                <div className="pls-selected-tracks">
                  <h3>Selected Tracks</h3>
                  <div className="pls-selected-tracks-table">
                    <div className="pls-selected-tracks-header">
                      <div>Title</div>
                      <div>Artist</div>
                      <div>Album</div>
                      <div>Duration</div>
                      <div>Action</div>
                    </div>
                    {newPlaylistTracks.map((track) => (
                      <div key={track.id} className="pls-selected-tracks-row">
                        <div>{track.custom_title || track.title}</div>
                        <div>{track.artist || "Unknown Artist"}</div>
                        <div>{track.album || "Unknown Album"}</div>
                        <div>{formatDuration(track.duration)}</div>
                        <div>
                          <button
                            className="pls-action-button icon-only"
                            onClick={() => handleRemoveTrackFromNewPlaylist(track.id)}
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="pls-action-button"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
              >
                <FaPlus /> Create
              </button>
            </div>
          </div>
          <div className="pls-grid-block">
            <div className="pls-block-header">
              <div className="pls-header-actions">
                <button className="pls-action-button" onClick={handlePlayAll}>
                  <FaPlay /> Play
                </button>
                <button className="pls-action-button" onClick={handlePlayShuffleAll}>
                  <FaRandom /> Shuffle
                </button>
              </div>
            </div>
            <div className="pls-grid">
              {playlists.length > 0 ? (
                playlists.map(playlist => (
                  <div key={playlist.id} className="pls-card">
                    <div
                      className="pls-card-header"
                      onClick={() => navigate(`/playlists/${playlist.id}`)} // Updated navigation
                    >
                      <div className="pls-image-wrapper">
                        <img
                          src={`/godspeed/playlists/${playlist.id}/cover`}
                          alt={`Cover for ${playlist.name}`}
                          onError={(e) => {
                            e.target.src = '/placeholder-cover.jpg';
                            e.target.onerror = null;
                          }}
                        />
                        <button
                          className="pls-card-remove-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePlaylist(playlist.id);
                          }}
                          title="Remove Playlist"
                        >
                          <FaTrash />
                        </button>
                      </div>
                      <div className="pls-card-info">
                        <div>
                          <div className="pls-card-title">{playlist.name}</div>
                          <div className="pls-card-meta">
                            {playlist.track_count} track{playlist.track_count !== 1 ? 's' : ''} • {formatDateTime(playlist.created_at)}
                          </div>
                          <div className="pls-card-description">{playlist.description || "No description"}</div>
                        </div>
                        <div className="pls-card-buttons">
                          <button
                            className="pls-action-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fetchTracks = async () => {
                                try {
                                  const res = await fetch(`/godspeed/playlists/${playlist.id}`);
                                  if (!res.ok) {
                                    const errorData = await res.json();
                                    throw new Error(errorData.error || 'Failed to fetch playlist tracks');
                                  }
                                  const data = await res.json();
                                  const queueTracks = data.tracks.map(track => ({
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
                                  playQueue(queueTracks, 0);
                                } catch (error) {
                                  console.error('Failed to play playlist:', error);
                                  setError(error.message || 'Failed to play playlist. Please try again.');
                                }
                              };
                              fetchTracks();
                            }}
                          >
                            <FaPlay /> Play
                          </button>
                          <button
                            className="pls-action-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fetchTracks = async () => {
                                try {
                                  const res = await fetch(`/godspeed/playlists/${playlist.id}`);
                                  if (!res.ok) {
                                    const errorData = await res.json();
                                    throw new Error(errorData.error || 'Failed to fetch playlist tracks');
                                  }
                                  const data = await res.json();
                                  const queueTracks = data.tracks.map(track => ({
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
                                  queueTracks.sort(() => Math.random() - 0.5);
                                  playQueue(queueTracks, 0);
                                } catch (error) {
                                  console.error('Failed to shuffle playlist:', error);
                                  setError(error.message || 'Failed to shuffle playlist. Please try again.');
                                }
                              };
                              fetchTracks();
                            }}
                          >
                            <FaRandom /> Shuffle
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <span className="pls-page-placeholder">No playlists exist</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default PlaylistsPage;