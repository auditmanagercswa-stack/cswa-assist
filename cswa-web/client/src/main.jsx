import React from 'react';
import ReactDOM from 'react-dom/client';
// Global styles first, so component stylesheets (imported by App) can override them.
import './styles/theme.css';
import './styles/global.css';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
