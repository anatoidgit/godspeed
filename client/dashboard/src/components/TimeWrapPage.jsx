import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioStore } from '../stores/useAudioStore';
import './timewrappage.css';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const parseTimestamp = (timestamp) => {
  if (typeof timestamp === 'string') {
    const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      return date;
    }
    console.error('Invalid timestamp after normalization:', timestamp, normalized);
  }
  return null;
};

const formatPlayedAtTime = (timestamp) => {
  try {
    const date = parseTimestamp(timestamp);
    if (!date) {
      console.error('Invalid timestamp for time:', timestamp);
      return 'Unknown Time';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  } catch (error) {
    console.error('Error parsing timestamp:', timestamp, error);
    return 'Unknown Time';
  }
};

const formatDate = (timestamp) => {
  try {
    const date = parseTimestamp(timestamp);
    if (!date) {
      console.error('Invalid timestamp for date:', timestamp);
      return 'Unknown Date';
    }
    return date.toLocaleDateString([], { timeZone: 'UTC' });
  } catch (error) {
    console.error('Error parsing date:', timestamp, error);
    return 'Unknown Date';
  }
};

const TrackRow = memo(({ track, isPlaying, onClick, navigate }) => (
  <div
    className={`timewrap-track-row ${track.track_id === isPlaying ? 'playing' : ''}`}
    onClick={() => onClick(track)}
  >
    <div className="tw-cell played-at">{formatPlayedAtTime(track.timestamp)}</div>
    <div className="tw-cell title">{track.title}</div>
    <div
      className="tw-cell artist clickable"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/artist?artist=${encodeURIComponent(track.artist || 'Unknown Artist')}`);
      }}
    >
      {track.artist}
    </div>
    <div
      className="tw-cell album clickable"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/album?album=${encodeURIComponent(track.album || 'Unknown Album')}`);
      }}
    >
      {track.album}
    </div>
    <div className="tw-cell time">{formatDuration(track.duration)}</div>
  </div>
));

function TimeWrapPage() {
  const navigate = useNavigate();
  const { playTrack, currentTrackId } = useAudioStore();
  const [history, setHistory] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/godspeed/history');
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status}`);
        }
        const data = await response.json();
        console.log('Fetched history:', data);

        const formattedData = data.map(item => ({
          id: item.id,
          track_id: item.track_id,
          title: item.title || 'Unknown Track',
          artist: item.artist || 'Unknown Artist',
          album: item.album || 'Unknown Album',
          duration: item.duration || 0,
          audioSrc: `/godspeed/track/${item.track_id}/play`,
          album_id: item.album_id,
          timestamp: item.timestamp,
          year: item.year || 'Unknown Year',
          albumCover: item.album_id ? `/godspeed/album/${item.album_id}/cover` : '/default-cover.jpg',
          waveformImage: item.waveform_path || '/waveforms/default.webp',
          codec: item.codec || 'Unknown',
          bitrate: item.bitrate || null,
          fileSize: item.file_size || null,
        }));

        setHistory(formattedData);

        const validTimestamps = formattedData
          .map(item => ({ timestamp: item.timestamp, date: parseTimestamp(item.timestamp) }))
          .filter(item => item.date !== null)
          .sort((a, b) => b.date - a.date);

        const mostRecentDate = validTimestamps.length > 0
          ? formatDate(validTimestamps[0].timestamp)
          : formatDate(new Date());

        console.log('Valid timestamps:', validTimestamps);
        console.log('Most recent date:', mostRecentDate);

        setExpandedDates({ [mostRecentDate]: true });
        setLoading(false);
      } catch (error) {
        console.error('Error loading history:', error);
        setError('Failed to load play history. Please try again.');
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const handleTrackClick = async (track) => {
    console.log('Clicked track:', track);
    const trackId = track.track_id;
    if (!trackId) {
      console.error('No valid track_id found for track:', track);
      return;
    }

    try {
      const trackResponse = await fetch(`/godspeed/tracks?track_id=${trackId}`);
      if (!trackResponse.ok) {
        throw new Error(`Failed to fetch track details: ${trackResponse.status}`);
      }
      const trackData = await trackResponse.json();
      console.log('Fetched track data:', trackData);

      if (!trackData) {
        throw new Error('Empty track data returned');
      }

      const trackToPlay = {
        id: trackId,
        title: trackData.title || track.title || 'Unknown Track',
        artist: trackData.artist || track.artist || 'Unknown Artist',
        album: trackData.album || track.album || 'Unknown Album',
        year: trackData.year || track.year || 'Unknown Year',
        duration: trackData.duration || track.duration || 0,
        audioSrc: `/godspeed/track/${trackId}/play`,
        albumCover: trackData.album_id || track.album_id
          ? `/godspeed/album/${trackData.album_id || track.album_id}/cover`
          : '/default-cover.jpg',
        waveformImage: trackData.waveform_path || track.waveformImage || '/waveforms/default.webp',
        codec: trackData.codec || track.codec || 'Unknown',
        bitrate: trackData.bitrate || track.bitrate || null,
        fileSize: trackData.file_size || track.fileSize || null,
        playSingle: true,
      };

      console.log('Track to play:', trackToPlay);
      await playTrack(trackToPlay);
    } catch (error) {
      console.error('Error fetching track details for track_id', trackId, ':', error);
      const trackToPlay = {
        id: trackId,
        title: track.title || 'Unknown Track',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        year: track.year || 'Unknown Year',
        duration: track.duration || 0,
        audioSrc: `/godspeed/track/${trackId}/play`,
        albumCover: track.album_id
          ? `/godspeed/album/${track.album_id}/cover`
          : '/default-cover.jpg',
        waveformImage: track.waveformImage || '/waveforms/default.webp',
        codec: track.codec || 'Unknown',
        bitrate: track.bitrate || null,
        fileSize: track.fileSize || null,
        playSingle: true,
      };
      console.log('Fallback track to play:', trackToPlay);
      await playTrack(trackToPlay);
    }
  };

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const groupedHistory = history.reduce((acc, item) => {
    const date = formatDate(item.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  const filteredGroupedHistory = Object.entries(groupedHistory).reduce((acc, [date, tracks]) => {
    const filteredTracks = tracks.filter(
      track =>
        track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
        track.album.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filteredTracks.length > 0) acc[date] = filteredTracks;
    return acc;
  }, {});

  const sortedDates = Object.keys(filteredGroupedHistory).sort((a, b) => {
    const dateA = a === 'Unknown Date' ? new Date(0) : parseTimestamp(a) || new Date(0);
    const dateB = b === 'Unknown Date' ? new Date(0) : parseTimestamp(b) || new Date(0);
    return dateB - dateA;
  });

  if (loading) {
    return <div className="timewrap-main-content">Loading play history...</div>;
  }

  if (error) {
    return <div className="timewrap-main-content error">{error}</div>;
  }

  return (
    <div className="timewrap-main-content">
      <div className="timewrap-container">
        <input
          type="text"
          placeholder="Search history..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="timewrap-search-bar"
        />
        {sortedDates.length === 0 ? (
          <p>No play history available.</p>
        ) : (
          sortedDates.map(date => {
            const tracks = filteredGroupedHistory[date];
            const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
            return (
              <div key={date} className="timewrap-date-block">
                <div
                  className={`timewrap-date-header ${expandedDates[date] ? 'expanded' : ''}`}
                  onClick={() => toggleDate(date)}
                >
                  <span>{date}</span>
                  <span>
                    {tracks.length} track{tracks.length !== 1 ? 's' : ''} — {formatDuration(totalDuration)}
                  </span>
                </div>
                {expandedDates[date] && (
                  <div className="timewrap-track-list">
                    {tracks.map(track => (
                      <TrackRow
                        key={`${track.track_id}-${track.timestamp}`}
                        track={track}
                        isPlaying={currentTrackId}
                        onClick={handleTrackClick}
                        navigate={navigate}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default memo(TimeWrapPage);