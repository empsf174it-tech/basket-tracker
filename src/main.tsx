import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { requestPersistentStorage } from './db/repo';
import { App } from './ui/App';
import './index.css';

// Keep saved shots from being cleared by the browser when the phone is low on space.
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
