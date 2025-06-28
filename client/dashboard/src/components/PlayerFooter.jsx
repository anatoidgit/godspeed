import React, { useRef, useState } from "react";
import { useAudioStore } from "../stores/useAudioStore";
import { useAudioEvents } from "../hooks/useAudioEvents";
import {
  FaPlay,
  FaPause,
  FaStepForward,
  FaStepBackward,
  FaHeart,
  FaTags,
  FaInfoCircle,
  FaListUl,
} from "react-icons/fa";
import QueueList from "./QueueList";
import "./PlayerFooter.css";

const formatTime = (seconds) => {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

function PlayerFooter() {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    progress,
    duration,
    seekTo,
    playNext,
    playPrevious,
    queue,
    currentIndex,
    audioRef,
    currentPlaySessionRef,
    setProgress,
    setDuration,
  } = useAudioStore();

  const waveformRef = useRef(null);
  const [showQueue, setShowQueue] = useState(false);

  useAudioEvents(audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration);

  const handleSeek = (e) => {
    if (!waveformRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(percent);
  };

  const safeProgress = isNaN(progress) ? 0 : progress;
  const safeDuration = isNaN(duration) ? 0 : duration;

  if (!currentTrack) {
    return (
      <div className="player-footer empty">
        <p>No track playing</p>
      </div>
    );
  }

  return (
    <>
      <div className="player-footer">
        <div className="player-section info-block">
          <img
            src={currentTrack.albumCover || "/placeholder-cover.jpg"}
            alt="Cover"
            className="cover-art"
            onError={(e) => {
              e.target.src = "/placeholder-cover.jpg";
              e.target.onerror = null;
            }}
          />
          <div className="track-meta">
            <h4 className="track-title">{currentTrack.title}</h4>
            <p className="track-details">
              {currentTrack.artist} • {currentTrack.album} • {currentTrack.year}
            </p>
            <div className="audio-specs under-meta">
              <span>
                {currentTrack.bitrate
                  ? `${Math.round(currentTrack.bitrate / 1000)} kbps`
                  : "—"}
              </span>
              <span>{currentTrack.codec || "Unknown"}</span>
              <span>
                {currentTrack.fileSize
                  ? `${Math.round(currentTrack.fileSize / 1024 / 1024)} MB`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="player-section control-block">
          <div className="controls-and-waveform">
            <div className="controls">
              <button
                onClick={() => playPrevious()}
                title="Previous"
                disabled={queue.length === 0 || currentIndex === 0}
              >
                <FaStepBackward />
              </button>
              <button onClick={togglePlayPause} title="Play/Pause">
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <button
                onClick={() => playNext()}
                title="Next"
                disabled={queue.length === 0 || currentIndex >= queue.length - 1}
              >
                <FaStepForward />
              </button>
            </div>
            <div className="waveform-row">
              <span className="wave-time">
                {formatTime(safeProgress * safeDuration)}
              </span>
              <div
                className="waveform-wrapper"
                onClick={handleSeek}
                ref={waveformRef}
              >
                <img
                  src={currentTrack.waveformImage || "/waveforms/default.webp"}
                  alt="Waveform"
                  className="waveform-static"
                />
                <div
                  className="waveform-mask"
                  style={{ width: `${(1 - safeProgress) * 100}%` }}
                />
                <div className="progress-bar-foreground">
                  <div
                    className="progress-knob"
                    style={{ left: `${safeProgress * 100}%` }}
                  />
                </div>
              </div>
              <span className="wave-time">{formatTime(safeDuration)}</span>
            </div>
          </div>
        </div>

        <div className="player-section quality-block">
          <div className="footer-actions">
            <button title="Label">
              <FaTags />
            </button>
            <button title="Metadata">
              <FaInfoCircle />
            </button>
            <button title="Favorite">
              <FaHeart />
            </button>
            <button
              title="Show Queue"
              onClick={() => setShowQueue((prev) => !prev)}
            >
              <FaListUl />
            </button>
          </div>
        </div>
      </div>

      {showQueue && (
        <div className="queue-overlay">
          <QueueList />
        </div>
      )}
    </>
  );
}

export default PlayerFooter;