import React from "react";
import "./waveformprogress.css";

const WaveformProgress = ({ waveformImage, progress = 0 }) => {
  return (
    <div className="waveform-wrapper">
      {/* Background: full waveform, dimmed */}
      <img src={waveformImage} alt="waveform" className="waveform-bg" />

      {/* Foreground: colored waveform, clipped based on progress */}
      <div
        className="waveform-foreground"
        style={{ width: `${progress * 100}%` }}
      >
        <img src={waveformImage} alt="waveform progress" />
      </div>
    </div>
  );
};

export default WaveformProgress;
