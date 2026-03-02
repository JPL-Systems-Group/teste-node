const counters = {
  total_orders_processed: 0,
  total_failures: 0,
  retry_count: 0,
};

export function inc(name, value = 1) {
  if (Object.hasOwn(counters, name)) counters[name] += value;
}

export function getMetricsSnapshot() {
  return { ...counters };
}

export function getPrometheusMetrics() {
  return Object.entries(counters)
    .map(([key, value]) => `# TYPE ${key} counter\n${key} ${value}`)
    .join('\n');
}
