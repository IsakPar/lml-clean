# LML v1 Foundation - Clean Rebuild

**Status:** Foundation Complete ✅ | Ready for Phase 1 API Development  
**Migration Date:** 2025-08-01  
**Purpose:** Clean, production-ready foundation for Last Minute Live ticketing platform

---

## 🎯 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ & pnpm
- Xcode 15+ (for iOS development)

### Setup (5 minutes)
```bash
# 1. Clone and navigate
cd rebuild/v1-foundation/

# 2. Setup environment
cp env.example .env
# Edit .env with your actual values (Stripe keys, etc.)

# 3. Start databases
docker-compose up -d

# 4. Verify database connections
docker-compose logs postgres mongodb redis
```

### Backend Development
```bash
cd backend/
pnpm install
pnpm run dev
```

### Migrations (local & CI)
```bash
# Create a fresh dev DB and apply migrations 009..013 lexically
cd backend
export DATABASE_URL=postgresql://localhost:5432/lml_dev
pnpm migrate

# Re-run is idempotent; migrator records filename + checksum in _migrations
# Production note: set MIGRATE_CONCURRENT_INDEX=true to keep CREATE INDEX CONCURRENTLY
```

Notes
- Zero-downtime: current migrations are additive (tables/indexes only); no destructive changes.
- Drift detection: migrator stores SHA-256 checksum per file and fails if file changes after apply.
- Timeouts: migrator sets lock_timeout=2s and statement_timeout=30s to avoid hanging builds.
- Guardrails: files with CREATE INDEX CONCURRENTLY must contain only that statement when MIGRATE_CONCURRENT_INDEX=true.

### iOS Development
```bash
cd ios/
open LML.xcodeproj
# Select LML scheme, run in simulator
```

---

## 📁 Architecture Overview

```
rebuild/v1-foundation/
├── backend/               # Next.js API server
│   └── src/
│       ├── app/api/v1/   # Versioned API endpoints
│       └── lib/          # Services, DB connections, utilities
├── ios/                  # SwiftUI iOS app
│   └── LML/
│       ├── Core/         # Models, services, utilities
│       └── Views/        # UI components
├── database/             # Database schemas & initialization
│   ├── postgres/         # PostgreSQL schema
│   ├── mongodb/          # MongoDB collections & validators
│   └── redis/            # Redis configuration
└── docs/                 # Documentation & migration tracking
```

---

## 🗄️ Database Strategy

### PostgreSQL - Transactional Data
- Shows, bookings, users, payments
- ACID compliance for financial transactions
- Drizzle ORM for type-safe queries

### MongoDB - Layout Data  
- Venue layouts, seat coordinates, visual elements
- Flexible schemas for different theater types
- Fast read access for seat map rendering

### Redis - Session & Cache
- User sessions, seat reservations
- 15-minute seat holds during booking process
- Performance caching for frequently accessed data

---

## 🚀 Development Standards

### API Design
- **Versioned:** All endpoints under `/api/v1/`
- **RESTful:** Resource-oriented URLs
- **Consistent:** Standard response formats
- **Documented:** OpenAPI/Swagger specs

### Code Quality
- **TypeScript:** Strict mode, no any types
- **Testing:** Unit tests for all services
- **Validation:** Zod schemas for all inputs
- **Security:** Input sanitization, CORS, rate limiting

### iOS Standards
- **SwiftUI:** Modern declarative UI
- **Clean Architecture:** Separation of concerns
- **MVVM:** Model-View-ViewModel pattern
- **Testing:** Unit tests for all business logic

---

## 📊 Migration Status

### ✅ Successfully Migrated
- **Database Schemas:** Clean PostgreSQL + MongoDB schemas
- **Development Environment:** Docker Compose with health checks  
- **Configuration:** Sanitized environment templates
- **Utilities:** Security validation functions

### ❌ Deliberately Left Behind
- **Legacy API Routes:** Complex hybrid endpoints
- **iOS Components:** Business logic coupled to UI
- **Fallback Logic:** Dangerous multi-layered fallbacks
- **Experimental Code:** Proof-of-concept implementations

---

## 🔄 Current Phase: Phase 1 - API Foundation

### Immediate Next Steps
1. **Build Core API Endpoints**
   - `GET /api/v1/shows` - List all shows
   - `GET /api/v1/shows/{id}/seatmap` - Get seat map with pricing
   - `GET /api/v1/health` - Service health check

2. **Setup Database Connections**
   - PostgreSQL with Drizzle ORM
   - MongoDB with proper authentication
   - Redis for session management

3. **API Testing & Validation**
   - Integration tests for all endpoints
   - Load testing for seat map endpoint
   - Error handling and edge cases

### Success Criteria
- All database connections stable
- `curl http://localhost:3001/api/v1/health` returns 200
- Seat map API returns complete JSON in <200ms
- Zero authentication failures in development

---

## 📚 Key Documentation

- **[Migration Masterplan](../migration-masterplan.md)** - Overall rebuild strategy
- **[Migration Checklist](../docs/migration-checklist.md)** - File-by-file migration tracking  
- **[Inventory](docs/inventory.md)** - What was migrated vs. left behind
- **[API Documentation](docs/api/)** - API specifications (coming in Phase 1)

---

## 🆘 Getting Help

### Common Issues
- **Database Connection Failures:** Check Docker containers are running
- **Port Conflicts:** Ensure ports 3001, 5432, 27017, 6379 are available
- **Environment Variables:** Verify .env file has all required values

### Development Support
- Check health endpoints: `curl http://localhost:3001/api/v1/health`
- Review Docker logs: `docker-compose logs [service-name]`
- Validate environment: `docker-compose ps`

---

**This is the foundation for a reliable, scalable ticketing platform. All future development happens here.**