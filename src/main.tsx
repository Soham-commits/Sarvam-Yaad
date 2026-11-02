import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './tailwind.css';
import './style.css';
import './components/ui/buttons.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
