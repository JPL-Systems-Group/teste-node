export function metricsController({ metrics }) {
  return function handleMetrics(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(metrics.getPrometheusMetrics());
  };
}
