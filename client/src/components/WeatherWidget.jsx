import API from '../services/api';
/**
 * @file WeatherWidget.jsx
 * @description Widget de clima actual usando OpenWeatherMap API
 * 
 * Props:
 * - location: String (ej: "Santo Domingo,DO") - ubicación para consultar clima
 * - configured: Boolean - indica si el servidor tiene la clave configurada
 * 
 * Responsabilidades:
 * - Obtener clima actual de OpenWeatherMap API
 * - Mostrar temperatura, descripción, humedad, sensación térmica
 * - Icono dinámico según condición climática (Cloud, Sun, Rain, etc.)
 * - Botón de refresh manual
 * - Manejo de estados: loading, error, success
 * 
 * Estados:
 * - weather: Objeto con temp, tempMin, tempMax, description, icon, humidity, feelsLike, lastUpdate
 * - loading: Boolean durante fetch
 * - error: String con mensaje de error si falla API
 * - refreshKey: Contador para forzar re-fetch manual
 * 
 * API:
 * - Endpoint autenticado: /api/proxy/weather
 * - La clave y la consulta a OpenWeatherMap permanecen en el servidor.
 * - Añade timestamp para evitar caché del navegador
 * 
 * Nota:
 * - Usa el cliente autenticado de MECANET.
 * - Se oculta si !location || !configured
 */

import { useState, useEffect } from 'react';
import { 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Sun, 
  CloudDrizzle, 
  Wind,
  CloudFog,
  Zap,
  Loader2,
  RefreshCw,
  Clock,
  MapPin,
  Eye
} from 'lucide-react';

const WeatherWidget = ({ location, configured = false, detailed = false }) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!location || !configured) {
      setLoading(false);
      return;
    }

    const fetchWeather = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data } = await API.get('/proxy/weather');

        setWeather({
          temp: Math.round(data.main.temp),
          tempMin: Math.round(data.main.temp_min),
          tempMax: Math.round(data.main.temp_max),
          description: data.weather[0].description,
          icon: data.weather[0].main.toLowerCase(),
          humidity: data.main.humidity,
          feelsLike: Math.round(data.main.feels_like),
          pressure: data.main.pressure,
          windSpeed: Math.round(data.wind?.speed || 0),
          cloudiness: data.clouds?.all || 0,
          visibility: Math.round((data.visibility || 0) / 1000), // convertir a km
          sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
          sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
          lastUpdate: new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
          cityName: data.name,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    
    // Actualizar cada 10 minutos (cambiado de 30 a 10 para testing)
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [location, configured, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const getWeatherIcon = (iconType, size = "w-5 h-5") => {
    const iconClass = size;
    
    switch (iconType) {
      case 'clear':
        return <Sun className={`${iconClass} text-yellow-400`} />;
      case 'clouds':
        return <Cloud className={`${iconClass} text-white`} />;
      case 'rain':
        return <CloudRain className={`${iconClass} text-blue-300`} />;
      case 'drizzle':
        return <CloudDrizzle className={`${iconClass} text-blue-300`} />;
      case 'snow':
        return <CloudSnow className={`${iconClass} text-blue-100`} />;
      case 'thunderstorm':
        return <Zap className={`${iconClass} text-yellow-300`} />;
      case 'mist':
      case 'fog':
      case 'haze':
        return <CloudFog className={`${iconClass} text-gray-300`} />;
      default:
        return <Wind className={`${iconClass} text-gray-300`} />;
    }
  };

  // Si está cargando
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Cargando clima...</span>
      </div>
    );
  }

  // Si hay error o no hay configuración
  if (error || !weather) {
    if (detailed) {
      return (
        <div className="p-6 text-center">
          <CloudFog className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {error || 'No se pudo cargar la información del clima'}
          </p>
        </div>
      );
    }
    return null; // No mostrar nada si hay error en modo compacto
  }

  // Vista detallada para Settings
  if (detailed) {
    const getWeatherGradient = (icon) => {
      switch (icon) {
        case 'clear':
          return 'from-yellow-400 via-orange-400 to-red-400';
        case 'clouds':
          return 'from-gray-400 via-gray-500 to-gray-600';
        case 'rain':
        case 'drizzle':
          return 'from-blue-400 via-blue-500 to-blue-600';
        case 'thunderstorm':
          return 'from-gray-700 via-gray-800 to-gray-900';
        case 'snow':
          return 'from-blue-200 via-blue-300 to-blue-400';
        default:
          return 'from-gray-400 via-gray-500 to-gray-600';
      }
    };

    return (
      <div className="space-y-6">
        {/* Header con gradiente según clima */}
        <div className={`relative p-8 rounded-2xl bg-gradient-to-br ${getWeatherGradient(weather.icon)} text-white overflow-hidden`}>
          {/* Patrón de fondo sutil */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
          </div>

          <div className="relative z-10">
            {/* Header principal */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-6">
                {/* Icono grande */}
                <div className="flex-shrink-0 bg-white/20 backdrop-blur-sm p-6 rounded-2xl">
                  {getWeatherIcon(weather.icon, "w-16 h-16")}
                </div>
                
                {/* Info principal */}
                <div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-7xl font-bold tabular-nums leading-none">
                      {weather.temp}°
                    </h2>
                    <div className="text-sm opacity-90">
                      <button className="px-2 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors">
                        °C
                      </button>
                    </div>
                  </div>
                  <p className="text-xl capitalize mt-3 opacity-90">
                    {weather.description}
                  </p>
                  <p className="text-sm mt-2 opacity-80 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {weather.cityName || location}
                  </p>
                </div>
              </div>

              {/* Botón refresh */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-3 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all disabled:opacity-50"
                title="Actualizar clima"
              >
                <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Rango de temperatura */}
            <div className="flex items-center gap-4 text-lg">
              <div className="flex items-center gap-2">
                <span className="opacity-80">↑</span>
                <span className="font-semibold">{weather.tempMax}°</span>
              </div>
              <div className="w-px h-6 bg-white/30"></div>
              <div className="flex items-center gap-2">
                <span className="opacity-80">↓</span>
                <span className="font-semibold">{weather.tempMin}°</span>
              </div>
              <div className="flex-1"></div>
              <div className="text-sm opacity-80">
                Sensación: {weather.feelsLike}°
              </div>
            </div>
          </div>
        </div>

        {/* Grid de información detallada */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Humedad */}
          <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <CloudDrizzle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Humedad</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {weather.humidity}%
            </p>
            <div className="mt-2 h-2 bg-blue-200 dark:bg-blue-900/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${weather.humidity}%` }}
              ></div>
            </div>
          </div>

          {/* Viento */}
          <div className="p-5 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 rounded-xl border border-cyan-200 dark:border-cyan-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Wind className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Viento</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {weather.windSpeed}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">km/h</p>
          </div>

          {/* Nubosidad */}
          <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/20 dark:to-gray-700/20 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gray-500/20 rounded-lg">
                <Cloud className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nubosidad</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {weather.cloudiness}%
            </p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-900/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gray-600 dark:bg-gray-400 rounded-full transition-all duration-500"
                style={{ width: `${weather.cloudiness}%` }}
              ></div>
            </div>
          </div>

          {/* Visibilidad */}
          <div className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Visibilidad</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {weather.visibility}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">km</p>
          </div>

          {/* Presión */}
          <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <CloudFog className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Presión</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {weather.pressure}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">hPa</p>
          </div>

          {/* Amanecer/Atardecer */}
          <div className="p-5 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Sun className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sol</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">↑ Sale</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{weather.sunrise}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">↓ Ocaso</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{weather.sunset}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con última actualización */}
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
          <Clock className="w-4 h-4" />
          <span>Última actualización: {weather.lastUpdate}</span>
        </div>
      </div>
    );
  }

  // Vista compacta para TopBar (por defecto)
  return (
    <div 
      className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 lg:py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
      title={`Última actualización: ${weather.lastUpdate || 'Ahora'}`}
    >
      {/* Icono del clima */}
      <div className="flex-shrink-0">
        {getWeatherIcon(weather.icon, "w-4 h-4 lg:w-5 lg:h-5")}
      </div>
      
      {/* Información del clima */}
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1.5 lg:gap-2">
          <span className="text-base lg:text-lg font-bold text-gray-900 dark:text-white tabular-nums">
            {weather.temp}°
          </span>
          <span className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400">
            {weather.tempMin}° / {weather.tempMax}°
          </span>
        </div>
        <span className="text-[10px] lg:text-xs text-gray-600 dark:text-gray-400 capitalize leading-tight">
          {weather.description}
        </span>
      </div>

      {/* Botón de recarga manual */}
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="ml-1 p-1 lg:p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        title="Actualizar clima"
      >
        <RefreshCw className={`w-3 h-3 lg:w-3.5 lg:h-3.5 text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};

export default WeatherWidget;
