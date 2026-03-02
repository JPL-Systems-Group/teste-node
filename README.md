# order-processor

Microsserviço Node.js para consumir eventos `OrderCreated` e atualizar pedidos para status `Processed`.

## Estrutura de pastas

```txt
.
├── src
│   ├── app
│   │   └── createApp.js
│   ├── config
│   │   └── env.js
│   ├── consumer
│   │   ├── messageHandler.js
│   │   ├── queueClient.js
│   │   └── retry.js
│   ├── controllers
│   │   └── healthController.js
│   ├── logging
│   │   └── logger.js
│   ├── metrics
│   │   └── metrics.js
│   ├── repository
│   │   └── orderRepository.js
│   ├── service
│   │   └── orderService.js
│   └── index.js
├── tests
│   └── all.test.js
├── Dockerfile
└── README.md
```

## Fluxo de processamento

1. `MockQueueClient` recebe mensagem no formato de evento `OrderCreated`.
2. `messageHandler` valida e faz parse do payload JSON.
3. `messageHandler` executa `orderService.processOrder()` com retry simples (`withRetry`).
4. `orderService` aplica idempotência e marca o pedido como `Processed` no repositório em memória.

## Idempotência

- Implementada via `processedOrderIds` (`Set`) no `OrderRepository`.
- Se `orderId` já foi processado, o serviço retorna `already_processed` e não reprocesa.

## Retry

- Retry simples em `withRetry(fn, { retries, delayMs })`.
- Configurável por variáveis:
  - `RETRY_LIMIT` (default `3`)
  - `RETRY_DELAY_MS` (default `200`)

## Resiliência

- Falha de parse JSON gera erro estruturado e incrementa métrica de falha.
- Falha após retries registra erro estruturado e rejeita o processamento.
- Em produção com RabbitMQ, mensagens com falha final devem ser redirecionadas para DLQ.

### DLQ em produção

- Configurar fila principal com `x-dead-letter-exchange` e `x-dead-letter-routing-key`.
- Mensagens que excederem retries devem ser publicadas/rejeitadas para a DLQ.
- Consumidor dedicado de DLQ para análise e reprocessamento seguro.

## Observabilidade

- Logs estruturados em JSON (`src/logging/logger.js`).
- Endpoint `GET /health` com status, uptime e métricas.
- Métricas simples em memória:
  - `ordersProcessed`
  - `orderProcessingFailures`
  - `queueMessagesReceived`
- Preparação para tracing: padronização de `traceparent` e `x-correlation-id` no fluxo HTTP/mensagem.

## Como rodar

```bash
npm start
```

Aplicação sobe em `http://localhost:3000`.

### Variáveis

- `PORT` (default `3000`)
- `QUEUE_NAME` (default `order.created`)
- `RETRY_LIMIT` (default `3`)
- `RETRY_DELAY_MS` (default `200`)

## Docker

```bash
docker build -t order-processor .
docker run --rm -p 3000:3000 order-processor
```

## Testes

```bash
npm test
```

Os testes usam o runner nativo do Node com cobertura, mantendo cobertura global acima de 81%.

## Trade-offs

1. Persistência em memória para simplificar demonstração.
2. Idempotência local (não compartilhada entre réplicas).
3. Retry linear simples (sem backoff exponencial/jitter).
4. Mock de mensageria para execução isolada; integração real com RabbitMQ fica como passo de produção.
