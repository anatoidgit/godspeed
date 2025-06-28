import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { useAudioStore } from './stores/useAudioStore';
import { useAudioEvents } from './hooks/useAudioEvents';

function Root() {
  useAudioStore(state => state.initializeAudio)();
  useAudioEvents();
  return (
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')).render(<Root />);