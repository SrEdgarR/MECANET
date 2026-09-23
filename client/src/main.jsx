/**
 * @file main.jsx
 * @description Entry point de la aplicación React
 * 
 * Responsabilidades:
 * - Renderizar el componente raíz <App />
 * - Importar estilos globales (index.css con Tailwind)
 * - Montar la aplicación en el div #root del HTML
 * 
 * Nota:
 * - No se usa <React.StrictMode> para evitar doble renderizado en desarrollo
 */

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <App />
);
