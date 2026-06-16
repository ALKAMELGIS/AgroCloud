export function getHealth(_req, res) {
  const configured = {
    openai: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    deepseek: Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim()),
    gemini: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
    mapbox: Boolean(String(process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN || '').trim()),
    openWeather: Boolean(String(process.env.OPENWEATHERMAP_API_KEY || '').trim()),
    sentinelHub: Boolean(String(process.env.SENTINEL_HUB_ACCESS_TOKEN || '').trim()),
    sentinelHubStats: Boolean(
      String(process.env.SENTINEL_HUB_CLIENT_ID || process.env.VITE_SENTINEL_HUB_CLIENT_ID || '').trim() &&
        String(process.env.SENTINEL_HUB_CLIENT_SECRET || process.env.VITE_SENTINEL_HUB_CLIENT_SECRET || '').trim(),
    ) ||
      Boolean(
        String(process.env.SENTINEL_HUB_ACCESS_TOKEN || process.env.VITE_SENTINEL_HUB_ACCESS_TOKEN || '').trim() &&
          String(process.env.SENTINEL_HUB_ACCESS_TOKEN || process.env.VITE_SENTINEL_HUB_ACCESS_TOKEN || '').trim() !==
            'PUBLIC_DATA_FEATURED_COLLECTIONS',
      ),
    googleMaps: Boolean(String(process.env.GOOGLE_MAPS_SERVER_API_KEY || '').trim()),
    apiSecretsFile: Boolean(String(process.env.AGRI_API_SECRETS_FILE || '').trim()),
    dataDir: Boolean(String(process.env.AGRI_DATA_DIR || '').trim()),
  }
  res.json({
    ok: true,
    service: 'agri-cloud-backend',
    env: String(process.env.NODE_ENV || 'development'),
    configured,
  })
}

