import React from "react";
import "./labelpopup.css";

const LabelPopup = ({ labels = [] }) => {
  return (
    <div className="label-popup">
      <div className="label-tags-inline">
        {labels.map((label, i) => (
          <span key={i}>#{label}</span>
        ))}
      </div>
      <input className="label-input" placeholder="Add label..." />
    </div>
  );
};

export default LabelPopup;
