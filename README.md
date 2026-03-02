# order-processor (production-ready)

Microsserviço Node.js orientado a eventos para consumir `OrderCreated`, aplicar idempotência transacional em PostgreSQL e atualizar estado para `Processed`.

## Arquitetura

- **Domain**: `src/domain`
- **Application**: `src/application`
- **Infra**: `src/infra` (PostgreSQL, RabbitMQ, observabilidade)
- **Interfaces**: `src/interfaces/http`

## Recursos implementados

1. RabbitMQ real com `amqplib`:
   - exchange `topic`
   - filas duráveis
   - ack manual
   - retry via exchange/queue de retry + TTL
   - DLQ final para mensagens esgotadas
2. Persistência real PostgreSQL com `pg`:
   - `processed_orders` (idempotência por PRIMARY KEY/UNIQUE)
   - `order_processing_log`
   - transação por evento processado
3. Autenticação JWT HS256:
   - `/health` e `/metrics` públicos
   - `/orders/:id` protegido com bearer token
4. Observabilidade:
   - logs estruturados JSON
   - endpoint `/metrics` Prometheus
   - contadores: `total_orders_processed`, `total_failures`, `retry_count`
5. Configuração obrigatória por ambiente:
   - `PORT`, `RABBITMQ_URL`, `POSTGRES_URL`, `JWT_SECRET`, `RETRY_ATTEMPTS`, `RETRY_DELAY_MS`

## Rodando local

```bash
npm ci
npm test
npm start
```

## Docker Compose

```bash
docker compose up --build
```

Serviços:
- node-service
- rabbitmq
- postgres

## CI

Workflow em `.github/workflows/ci.yml`:
- `npm ci`
- `npm test`
- fail se cobertura < 85%

## Trade-offs

- JWT validado localmente via `crypto` para reduzir dependências.
- Estratégia de retry é linear com TTL fixo; em produção, pode evoluir para exponential backoff.
