import React from "react";
import { useAudioStore } from "../stores/useAudioStore";
import "./AdvancedVolumeControl.css";

function AdvancedVolumeControl() {
  const {
    baseLeftVolume,
    baseRightVolume,
    masterVolume,
    pan,
    isMono,
    isMuted,
    replayGainEnabled,
    setBaseVolume,
    setMasterVolume,
    setPan,
    setMono,
    toggleMute,
    toggleReplayGain,
  } = useAudioStore();

  const handleLeftChange = (e) => {
    const value = parseFloat(e.target.value);
    setBaseVolume(value, baseRightVolume);
  };

  const handleRightChange = (e) => {
    const value = parseFloat(e.target.value);
    setBaseVolume(baseLeftVolume, value);
  };

  const handleMasterChange = (e) => {
    setMasterVolume(parseFloat(e.target.value));
  };

  const handlePanChange = (e) => {
    setPan(parseFloat(e.target.value));
  };

  const openEQ = () => {
    alert("EQ popup not implemented yet.");
  };

  return (
    <div className="volume-control">
      <div className="slider-group">
        <div className={`slider-column ${isMono ? "disabled" : ""}`}>
          <label>L</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={baseLeftVolume}
            onChange={handleLeftChange}
            disabled={isMono || isMuted}
            className="vertical-slider"
          />
          <div className="value-readout" title={`Left: ${Math.round(baseLeftVolume * 100)}%`}>
            {Math.round(baseLeftVolume * masterVolume * (isMuted ? 0 : 100))}%
          </div>
        </div>

        <div className="slider-column">
          <label>M</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={handleMasterChange}
            disabled={isMuted}
            className="vertical-slider"
          />
          <div className="value-readout">{Math.round(masterVolume * (isMuted ? 0 : 100))}%</div>
        </div>

        <div className={`slider-column ${isMono ? "disabled" : ""}`}>
          <label>R</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={baseRightVolume}
            onChange={handleRightChange}
            disabled={isMono || isMuted}
            className="vertical-slider"
          />
          <div className="value-readout" title={`Right: ${Math.round(baseRightVolume * 100)}%`}>
            {Math.round(baseRightVolume * masterVolume * (isMuted ? 0 : 100))}%
          </div>
        </div>
      </div>

      <div className="pan-control">
        <div className="pan-label-row">
          <label>Pan:</label>
          <span className="pan-readout">
            {pan < -0.01 ? `L ${Math.round(Math.abs(pan) * 100)}%` : pan > 0.01 ? `R ${Math.round(pan * 100)}%` : "Center"}
          </span>
        </div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={handlePanChange}
          disabled={isMuted}
        />
      </div>

      <div className="volume-buttons">
        <div className="button-row">
          <button
            className={`mute-toggle ${isMuted ? "active" : ""}`}
            onClick={toggleMute}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            className={`mono-toggle ${isMono ? "active" : ""}`}
            onClick={() => setMono(!isMono)}
          >
            Mono
          </button>
        </div>
        <div className="button-row">
          <button
            className={`replay-gain-toggle ${replayGainEnabled ? "active" : ""}`}
            onClick={toggleReplayGain}
            title="Replay Gain"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9h18v6H3z" />
              <path d="M12 3v18" />
            </svg>
          </button>
          <button
            className={`eq-button`}
            onClick={openEQ}
          >
            EQ
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdvancedVolumeControl;