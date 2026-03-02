const metrics = {
  ordersProcessed: 0,
  orderProcessingFailures: 0,
  queueMessagesReceived: 0,
};

function increment(metricName) {
  if (!(metricName in metrics)) {
    return;
  }
  metrics[metricName] += 1;
}

function snapshot() {
  return { ...metrics };
}

module.exports = { increment, snapshot };
