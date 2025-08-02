# LML iOS Client - Phase 2 Clean Implementation

**Status:** Phase 2 Complete ✅  
**API Version:** v1  
**Architecture:** Clean, No Fallback Logic

---

## 🎯 Overview

This is the **clean iOS implementation** for LML's v1 API integration. Unlike the legacy iOS code, this implementation:

- ✅ **No Fallback Logic** - Direct communication with v1 API endpoints
- ✅ **Single Responsibility** - Each component has one clear purpose  
- ✅ **Type Safe** - Full Swift type safety with proper error handling
- ✅ **Testable** - Unit tests for all business logic
- ✅ **Predictable** - Clear state management with no complex flows

---

## 📁 Project Structure

```
ios/
├── LML/
│   ├── Core/
│   │   ├── Models/
│   │   │   ├── Show.swift         # Clean show data models
│   │   │   ├── SeatMap.swift      # Seatmap models (MongoDB + PostgreSQL)
│   │   │   └── Booking.swift      # Booking & payment models
│   │   ├── Services/
│   │   │   └── APIClient.swift    # Simple v1 API client (NO fallbacks)
│   │   └── Utils/
│   │       └── Environment.swift  # Clean environment configuration
│   └── Views/
│       └── SeatMap/
│           └── SeatMapViewModel.swift  # Simplified state management
└── LMLTests/
    └── UnitTests/
        └── APIClientTests.swift   # API integration tests
```

---

## 🚀 Quick Start

### 1. API Client Usage

```swift
let apiClient = APIClient.shared

// Get all shows (from PostgreSQL)
let shows = try await apiClient.getShows()

// Get seatmap (MongoDB layout + PostgreSQL pricing)  
let seatMap = try await apiClient.getSeatMap(showId: "hamilton-victoria-palace")

// Create payment intent
let payment = try await apiClient.createPaymentIntent(
    showId: "hamilton-victoria-palace",
    seatIds: ["premium-A-1", "premium-A-2"],
    customerEmail: "user@example.com"
)
```

### 2. Seat Map View Model Usage

```swift
@StateObject private var viewModel = SeatMapViewModel()

// Load seatmap for a show
await viewModel.loadSeatMap(for: selectedShow)

// Handle seat selection
viewModel.toggleSeat(seat)

// Process payment
await viewModel.createPaymentIntent(customerEmail: "user@example.com")
```

---

## 🔧 API Endpoints Used

All endpoints are **v1 versioned** and point to the clean backend:

- **Health Check:** `GET /api/v1/health`
- **Shows List:** `GET /api/v1/shows`  
- **Seatmap:** `GET /api/v1/shows/{showId}/seatmap`
- **Payment Intent:** `POST /api/v1/payment/intent`
- **User Tickets:** `GET /api/v1/user/tickets?email={email}`

### Environment Configuration

```swift
// Development: http://localhost:3001
// Production: https://then-production.up.railway.app

let config = EnvironmentConfig.shared
print("API URL: \(config.apiEnvironment.baseURL)")
```

---

## 🧪 Testing

### Run Unit Tests

```bash
# Open in Xcode and run tests
open LML.xcodeproj

# Or use xcodebuild
xcodebuild test -scheme LML -destination 'platform=iOS Simulator,name=iPhone 15'
```

### Test Coverage

- ✅ APIClient endpoint integration
- ✅ SeatMapViewModel state management  
- ✅ Environment configuration validation
- ✅ Error handling scenarios
- ✅ Mock data for UI previews

---

## 🎯 Key Differences from Legacy

| Aspect | Legacy Code | Clean Implementation |
|--------|-------------|---------------------|
| **API Strategy** | Complex fallback logic | Single v1 endpoint |
| **Error Handling** | Silent failures, retries | Clear error states |
| **State Management** | Multi-layered API calls | Single responsibility |
| **Environment** | Hardcoded Railway URLs | Configurable environments |
| **Testing** | Minimal test coverage | Comprehensive unit tests |
| **Code Complexity** | 1000+ line files | Focused, single-purpose files |

---

## 🔄 Integration with Backend

This iOS client is designed to work **exclusively** with the Phase 1 backend located at:

```
rebuild/v1-foundation/backend/
```

### Required Backend Endpoints

The iOS client expects these endpoints to be running:

1. **Health Check** - Validates database connections
2. **Shows API** - Dynamic show loading from PostgreSQL  
3. **Seatmap API** - Hybrid MongoDB + PostgreSQL data
4. **Payment API** - Stripe integration for bookings

### Backend Setup

```bash
cd rebuild/v1-foundation/backend/
pnpm install
pnpm run dev  # Starts on localhost:3001
```

---

## 🚧 Development Guidelines

### 1. No Legacy Dependencies
- **Never import** from legacy codebase
- **Never copy-paste** without cleanup
- **Always create** clean implementations

### 2. Single Responsibility Principle
- Each file has **one clear purpose**
- No mixing of UI and business logic
- Clear separation of concerns

### 3. Error Handling
- **Always handle** API errors gracefully
- **Display user-friendly** error messages
- **Log detailed errors** for debugging

### 4. Testing Requirements
- **Unit tests** for all business logic
- **Mock clients** for UI previews
- **Integration tests** for API calls

---

## ⚠️ Important Notes

### 🚫 What NOT to Do

- ❌ **Don't add fallback logic** - Keep it simple
- ❌ **Don't hardcode URLs** - Use Environment configuration  
- ❌ **Don't mix legacy code** - Keep implementation clean
- ❌ **Don't skip tests** - Maintain test coverage

### ✅ What TO Do

- ✅ **Follow existing patterns** - Use established conventions
- ✅ **Add comprehensive logging** - Help with debugging
- ✅ **Handle all error states** - Never let users see crashes
- ✅ **Keep files focused** - Single responsibility principle

---

## 🔜 Phase 3 Ready

This iOS implementation is designed to easily integrate with **Phase 3** features:

- **Redis Session Management** - Already supports guest sessions
- **Seat Reservations** - 15-minute holds with Redis
- **Real-time Updates** - WebSocket ready architecture  
- **Enhanced Security** - JWT token support ready

---

## 📚 Documentation Links

- [Phase 1 Backend](../backend/README.md) - API documentation
- [Database Schema](../database/README.md) - PostgreSQL + MongoDB setup
- [Environment Setup](../README.md) - Complete development setup
- [API Reference](../docs/api/) - Complete API specification

---

**✨ This iOS implementation represents the future of LML's mobile architecture - clean, reliable, and maintainable.**