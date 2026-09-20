import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SitzungsRahmen } from './sitzung';
import './stil.css';

const wurzel = document.getElementById('app');
if (!wurzel) throw new Error('Element #app fehlt in index.html');

createRoot(wurzel).render(
  <StrictMode>
    <SitzungsRahmen>
      <App />
    </SitzungsRahmen>
  </StrictMode>
);
