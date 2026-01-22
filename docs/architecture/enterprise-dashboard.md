# Saga Engine Enterprise Dashboard - Architecture Plan

## Overview

The Enterprise Dashboard is a hosted SaaS offering that provides state management, observability, and team collaboration features for organizations using Saga Engine at scale.

**Business Model:** Product-Led Growth (PLG)
- **Free:** Open-source SDK (`@saga-engine/core`) for local development
- **Paid:** Hosted dashboard with durable storage, monitoring, and team features

## Target Users

1. **AI/ML Teams** building autonomous agents with real-world side effects
2. **Platform Teams** managing microservices with distributed transactions
3. **FinTech Companies** requiring audit trails and compliance

## Product Tiers

### Free (Open Source SDK)
- `@saga-engine/core` - Full saga orchestration
- `InMemoryStore` - Development/testing
- Self-hosted storage adapters (Redis, Postgres)

### Team ($49/month)
- Hosted state storage (up to 100K sagas/month)
- Basic dashboard with saga list and status
- 7-day retention
- 3 team members
- Email support

### Business ($199/month)
- Hosted state storage (up to 1M sagas/month)
- Full observability dashboard
- 30-day retention
- 10 team members
- Alerting and notifications
- Priority support

### Enterprise (Custom)
- Unlimited sagas
- Custom retention policies
- Unlimited team members
- SSO/SAML integration
- Dedicated infrastructure
- SLA guarantees (99.99%)
- Custom integrations
- Dedicated support

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  AI Agent App   │  │  Microservice   │  │   Workflow App  │             │
│  │  (LangChain)    │  │    (Node.js)    │  │   (Python)      │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                    @saga-engine/core SDK                                    │
│                    (with CloudStore adapter)                                │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │ HTTPS/WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Saga Engine Cloud                                   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         API Gateway                                   │  │
│  │  - Authentication (API Keys, OAuth)                                   │  │
│  │  - Rate Limiting                                                      │  │
│  │  - Request Routing                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                 │                                           │
│         ┌───────────────────────┼───────────────────────┐                  │
│         │                       │                       │                  │
│         ▼                       ▼                       ▼                  │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐            │
│  │  State API  │        │ Events API  │        │  Query API  │            │
│  │  (Write)    │        │ (WebSocket) │        │  (Read)     │            │
│  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘            │
│         │                      │                      │                    │
│         └──────────────────────┼──────────────────────┘                    │
│                                │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Event Processing Layer                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │  Kafka/    │  │  Event     │  │  Metrics   │  │  Alert     │      │  │
│  │  │  Kinesis   │  │  Router    │  │  Collector │  │  Manager   │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                 │                                           │
│         ┌───────────────────────┼───────────────────────┐                  │
│         │                       │                       │                  │
│         ▼                       ▼                       ▼                  │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐            │
│  │ PostgreSQL  │        │ TimescaleDB │        │   Redis     │            │
│  │ (State)     │        │ (Metrics)   │        │  (Cache)    │            │
│  └─────────────┘        └─────────────┘        └─────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dashboard Frontend                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        React/Next.js App                             │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │ Overview │  │  Sagas   │  │ Metrics  │  │ Settings │            │   │
│  │  │   Page   │  │  List    │  │  Graphs  │  │   Page   │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                    Saga Detail View                           │   │   │
│  │  │  - Step Timeline                                              │   │   │
│  │  │  - State Inspector                                            │   │   │
│  │  │  - Compensation History                                       │   │   │
│  │  │  - Logs & Events                                              │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Saga State Management

**CloudStore Adapter** (SDK Integration)
```typescript
import { SagaOrchestrator } from '@saga-engine/core';
import { CloudStore } from '@saga-engine/cloud';

const orchestrator = new SagaOrchestrator({
  store: new CloudStore({
    apiKey: process.env.SAGA_ENGINE_API_KEY,
    projectId: 'my-project',
    region: 'us-east-1'
  })
});
```

**Features:**
- Automatic state persistence to cloud
- Multi-region replication
- Automatic failover
- Encryption at rest and in transit

### 2. Real-Time Observability

**Dashboard Views:**

| View | Description |
|------|-------------|
| Overview | Active sagas, success rate, p95 latency |
| Saga List | Filterable list with status, duration, steps |
| Saga Detail | Step-by-step timeline with state inspector |
| Metrics | Charts for throughput, latency, failure rates |
| Alerts | Configure thresholds and notification channels |

**Real-Time Updates:**
- WebSocket connection for live saga state changes
- Step execution events streamed to dashboard
- Compensation events with visual indicators

### 3. Debugging Tools

**State Inspector:**
- View input data at saga start
- See each step's result
- Inspect compensation actions
- Download full execution trace

**Error Analysis:**
- Stack traces for failed steps
- Compensation failure details
- Retry history

### 4. Team Collaboration

**Role-Based Access:**
| Role | Permissions |
|------|-------------|
| Viewer | View sagas and metrics |
| Developer | View + retry/cancel sagas |
| Admin | Full access + settings |
| Owner | Full access + billing |

**Audit Log:**
- Track all actions (who did what, when)
- Compliance-ready export
- 90-day history (Enterprise: unlimited)

### 5. Alerting & Notifications

**Alert Types:**
- Saga failure rate exceeds threshold
- Step latency exceeds threshold
- Compensation failures
- Error rate spike

**Channels:**
- Email
- Slack
- PagerDuty
- Webhook

## Data Model

```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  plan VARCHAR(50),
  created_at TIMESTAMP
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  name VARCHAR(255),
  api_key_hash VARCHAR(255),
  settings JSONB
);

-- Saga States (partitioned by created_at)
CREATE TABLE saga_states (
  id UUID,
  project_id UUID REFERENCES projects(id),
  saga_name VARCHAR(255),
  status VARCHAR(50),
  input JSONB,
  steps JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Events (for real-time streaming)
CREATE TABLE saga_events (
  id UUID PRIMARY KEY,
  saga_id UUID,
  project_id UUID,
  event_type VARCHAR(50),
  step_name VARCHAR(255),
  payload JSONB,
  created_at TIMESTAMP
);

-- Metrics (TimescaleDB hypertable)
CREATE TABLE saga_metrics (
  time TIMESTAMPTZ,
  project_id UUID,
  saga_name VARCHAR(255),
  metric_name VARCHAR(50),
  value DOUBLE PRECISION
);
SELECT create_hypertable('saga_metrics', 'time');
```

## API Design

### State API

```
POST   /v1/sagas                    # Create saga state
GET    /v1/sagas/:id                # Get saga state
PATCH  /v1/sagas/:id/status         # Update status
PATCH  /v1/sagas/:id/steps/:name    # Update step state
GET    /v1/sagas?status=running     # List sagas with filters
DELETE /v1/sagas/:id                # Delete saga state
```

### Events API (WebSocket)

```javascript
// Client subscribes to saga events
ws.send(JSON.stringify({
  type: 'subscribe',
  projectId: 'my-project',
  filters: { status: ['running', 'compensating'] }
}));

// Server sends events
{
  type: 'saga:step:executed',
  sagaId: 'abc-123',
  stepName: 'charge-payment',
  result: { chargeId: 'ch_xxx' },
  timestamp: '2024-01-15T10:30:00Z'
}
```

### Query API

```
GET /v1/analytics/overview          # Dashboard overview stats
GET /v1/analytics/metrics           # Time-series metrics
GET /v1/analytics/errors            # Error breakdown
```

## Security

### Authentication
- API Keys for SDK (per-project)
- OAuth 2.0 for Dashboard (Google, GitHub, SAML)
- JWT tokens for API access

### Data Protection
- TLS 1.3 for all connections
- AES-256 encryption at rest
- Customer-managed keys (Enterprise)
- SOC 2 Type II compliance roadmap

### Network Security
- VPC isolation
- IP allowlisting (Enterprise)
- Private Link support (Enterprise)

## Infrastructure

### Cloud Provider: AWS (primary), GCP (secondary)

**Services:**
| Component | AWS Service |
|-----------|------------|
| Compute | EKS (Kubernetes) |
| Database | RDS PostgreSQL |
| Time-series | TimescaleDB on EC2 |
| Cache | ElastiCache Redis |
| Events | MSK (Kafka) |
| CDN | CloudFront |
| DNS | Route 53 |

### Regions
- Phase 1: us-east-1, eu-west-1
- Phase 2: ap-southeast-1, us-west-2

### Scaling Targets
| Metric | Team | Business | Enterprise |
|--------|------|----------|------------|
| Sagas/month | 100K | 1M | Unlimited |
| Events/sec | 100 | 1K | 10K+ |
| API latency p99 | 200ms | 100ms | 50ms |
| Availability | 99.9% | 99.95% | 99.99% |

## Development Roadmap

### Phase 1: MVP (Months 1-3)
- [ ] CloudStore adapter for SDK
- [ ] Basic API (create, get, update, list)
- [ ] Simple dashboard (saga list, detail view)
- [ ] Authentication (API keys, OAuth)
- [ ] PostgreSQL storage
- [ ] Deployment to single region

### Phase 2: Observability (Months 4-6)
- [ ] Real-time WebSocket events
- [ ] Metrics collection and dashboards
- [ ] Basic alerting (email, Slack)
- [ ] Search and filtering
- [ ] Error analysis view

### Phase 3: Scale (Months 7-9)
- [ ] Multi-region deployment
- [ ] Kafka event streaming
- [ ] TimescaleDB for metrics
- [ ] Advanced alerting (PagerDuty, webhooks)
- [ ] Team management and RBAC

### Phase 4: Enterprise (Months 10-12)
- [ ] SSO/SAML integration
- [ ] Audit logging
- [ ] Custom retention policies
- [ ] Dedicated infrastructure option
- [ ] SOC 2 certification
- [ ] SLA implementation

## Success Metrics

### Product Metrics
- SDK downloads (npm)
- CloudStore adoption rate
- Dashboard daily active users
- Saga execution volume

### Business Metrics
- Free to paid conversion rate
- Monthly recurring revenue (MRR)
- Customer acquisition cost (CAC)
- Customer lifetime value (LTV)
- Net promoter score (NPS)

## Competitive Analysis

| Feature | Saga Engine | Temporal | AWS Step Functions |
|---------|-------------|----------|-------------------|
| Open Source SDK | ✅ | ✅ | ❌ |
| Automatic Compensation | ✅ | Manual | Manual |
| TypeScript-First | ✅ | ✅ | ❌ |
| Hosted Dashboard | ✅ | ✅ | AWS Console |
| AI Agent Focus | ✅ | ❌ | ❌ |
| Pricing | Per-saga | Per-action | Per-transition |

## Pricing Strategy

**Value Metric:** Sagas executed per month

This aligns cost with value - customers pay more as they process more transactions, which directly correlates with the business value they receive.

**Free Tier:**
- Open source SDK forever free
- Self-hosted unlimited
- 1,000 sagas/month on cloud (for testing)

This enables PLG - developers can evaluate the full platform before committing.
