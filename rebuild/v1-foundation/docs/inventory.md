# LML v1 Foundation - Migration Inventory

**Tracking what was migrated and what was left behind in the legacy codebase**

## ✅ Migrated Files

*Files successfully moved from legacy codebase to rebuild/v1-foundation/*

### Database Foundation
| Legacy Path | New Path | Rationale |
|-------------|----------|-----------|
| db/clean-schema.sql | database/postgres/schema.sql | Clean PostgreSQL schema with proper constraints, indexes, and separation of concerns |
| db/mongo-init.js | database/mongodb/init.js | MongoDB schema with validators, indexes, and sample data - production ready |

### iOS Components
| Legacy Path | New Path | Rationale |
|-------------|----------|-----------|
| *No components migrated* | *None* | *All iOS components failed migration criteria due to business logic coupling* |

### Configuration
| Legacy Path | New Path | Rationale |
|-------------|----------|-----------|
| docker-compose.yml | docker-compose.yml | Clean 3-service development environment (PostgreSQL, MongoDB, Redis) with health checks |
| .env-backup/docker-development.env | env.example | Sanitized environment template with v1 API configuration, all secrets removed |

### Utilities
| Legacy Path | New Path | Rationale |
|-------------|----------|-----------|
| src/lib/db/queries.ts (lines 23-70) | backend/src/lib/utils/validation.ts | Pure security validation functions with no external dependencies |

## ❌ Left Behind

*Files explicitly rejected and remaining in legacy codebase*

### Backend API Routes
| File | Reason for Rejection |
|------|---------------------|
| src/app/api/hybrid-seatmap/[showId]/route.ts | Complex runtime merging logic, authentication failures, unreliable |
| src/app/api/seatmap/init-hamilton/route.ts | Legacy initialization endpoint, replaced by clean data seeding |
| src/app/api/payment-intent-mongo/route.ts | MongoDB payment integration with fallback logic |

### iOS Components with Complex Logic
| File | Reason for Rejection |
|------|---------------------|
| LML/LML/LML/views/ViewModels/SeatMapViewModel.swift | Multi-layered API fallbacks, dangerous fallback logic, complex state management |
| LML/LML/LML/Core/Services/APIClient.swift | Hardcoded Railway URLs, localhost blocking logic, retry mechanisms |
| LML/LML/LML/views/Organisms/SeatMaps/SeatMapCanvas.swift | Heavy coupling to SeatMapViewModel, business logic mixing with UI, complex state management |

### Experimental/Incomplete Features
| File | Reason for Rejection |
|------|---------------------|
| src/app/venue-integration-demo/ | Proof-of-concept code, not production-ready |
| src/app/seatmap-test/ | Test/demo code, not part of core platform |

### Infrastructure
| File | Reason for Rejection |
|------|---------------------|
| Railway deployment configs | Legacy hosting platform, replaced in Phase 4 |
| Production .env files | Security - secrets not migrated |

## 🔄 Transformation Rules Applied

### Database
- ✅ Clean schemas migrated as-is
- ❌ Legacy migration scripts rejected (too many band-aids)
- ✅ Docker setup migrated with volume updates

### iOS
- ✅ Pure presentation components migrated
- ❌ ViewModels with business logic rejected
- ✅ Data models migrated after splitting into separate files

### API
- ❌ All existing API routes rejected
- ✅ New v1 API structure created from scratch

---

**Migration Status:** First Wave Complete ✅  
**Last Updated:** 2025-08-01  
**Total Files Migrated:** 5  
**Total Files Rejected:** 1  
**Current Phase:** Phase 1 - Foundation & New API (Ready for API Development)