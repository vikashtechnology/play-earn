export function registerHealthRoutes(app) {
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'rewards-platform-api',
      env: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    });
  });
}
