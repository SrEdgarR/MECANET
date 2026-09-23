import express from 'express';
import fetch from 'node-fetch';
import Settings from '../models/Settings.js';
import { protect } from '../middleware/authMiddleware.js';
import { fetchPublicImage } from '../services/publicImage.js';

const router = express.Router();
router.use(protect);
router.get('/image', async (req, res) => {
  try {
    const image = await fetchPublicImage(req.query.url);
    res.set({
      'Content-Type': image.type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600'
    }).send(image.data);
  } catch {
    res.status(400).json({ message: 'No se pudo cargar una imagen pública segura' });
  }
});

let weatherCache;
router.get('/weather', async (req, res) => {
  try {
    const settings = await Settings.findOne().select('+weatherApiKey');
    if (!settings?.showWeather || !settings.weatherApiKey || !settings.weatherLocation) {
      return res.status(400).json({ message: 'Configure el servicio de clima primero' });
    }
    const cacheKey = settings.weatherApiKey + ':' + settings.weatherLocation;
    if (weatherCache?.key === cacheKey && weatherCache.expires > Date.now()) return res.json(weatherCache.data);
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.search = new URLSearchParams({ q: settings.weatherLocation, units: 'metric', lang: 'es', appid: settings.weatherApiKey });
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), size: 128 * 1024 });
    if (!response.ok) {
      response.body?.destroy();
      return res.status(502).json({ message: 'El proveedor no pudo devolver el clima. Revise la configuración.' });
    }
    const data = await response.json();
    weatherCache = { key: cacheKey, data, expires: Date.now() + 10 * 60 * 1000 };
    res.json(data);
  } catch {
    res.status(502).json({ message: 'No se pudo consultar el clima' });
  }
});
export default router;
