# iOS View Migration Plan - Legacy to Clean v1

**Status:** Phase 2 Complete, Views Migration Ready  
**Date:** 2025-08-01  
**Target:** Migrate all legacy iOS views to clean rebuild structure

---

## 🎯 Migration Overview

### Legacy Structure Analysis Complete
- **✅ Analyzed:** 50+ legacy iOS files across Atomic Design structure
- **✅ Documented:** All views, components, and ViewModels  
- **✅ Planned:** Clean migration path for each component
- **✅ Prioritized:** Critical vs. nice-to-have components

### Clean Foundation Ready
- **✅ Xcode Project:** `rebuild/v1-foundation/ios/LML.xcodeproj`
- **✅ Portrait Locked:** No landscape orientation support
- **✅ Swipe-Back Disabled:** NavigationStack with manual navigation
- **✅ Models Ready:** Clean data models for v1 API
- **✅ API Client Ready:** Direct v1 endpoint communication

---

## 📋 Migration Status by Category

### ✅ **COMPLETED - Core Infrastructure**
| Component | Status | Location |
|-----------|--------|----------|
| Show.swift | ✅ Complete | `Core/Models/` |
| SeatMap.swift | ✅ Complete | `Core/Models/` |
| Booking.swift | ✅ Complete | `Core/Models/` |
| APIClient.swift | ✅ Complete | `Core/Services/` |
| Environment.swift | ✅ Complete | `Core/Utils/` |
| SeatMapViewModel.swift | ✅ Complete | `Views/SeatMap/` |
| APIClientTests.swift | ✅ Complete | `LMLTests/UnitTests/` |

### 🔄 **PRIORITY 1 - Main Screens (Need Migration)**
| Legacy File | Target Location | Migration Status | Notes |
|-------------|-----------------|------------------|-------|
| `ContentView.swift` | `Views/ContentView.swift` | ⬜ **TODO** | Main tab navigation |
| `HomeView.swift` | `Views/Screens/HomeView.swift` | ⬜ **TODO** | Show listing screen |
| `AccountView.swift` | `Views/Screens/AccountView.swift` | ⬜ **TODO** | User account management |
| `TicketsView.swift` | `Views/Screens/TicketsView.swift` | ⬜ **TODO** | User tickets display |
| `HamiltonSeatMapView.swift` | `Views/Screens/SeatMapView.swift` | ⬜ **TODO** | Universal seat map view |
| `TicketDetailView.swift` | `Views/Screens/TicketDetailView.swift` | ⬜ **TODO** | Individual ticket details |

### 🔄 **PRIORITY 2 - ViewModels (Need Migration)**
| Legacy File | Target Location | Migration Status | Notes |
|-------------|-----------------|------------------|-------|
| `AccountViewModel.swift` | `Views/ViewModels/AccountViewModel.swift` | ⬜ **TODO** | Account business logic |
| `TicketsViewModel.swift` | `Views/ViewModels/TicketsViewModel.swift` | ⬜ **TODO** | Tickets business logic |
| `HamiltonSeatMapViewModel.swift` | `Views/ViewModels/SpecializedSeatMapViewModel.swift` | ⬜ **TODO** | Show-specific seat logic |

### 🔄 **PRIORITY 3 - Authentication Components (Need Migration)**
| Legacy File | Target Location | Migration Status | Notes |
|-------------|-----------------|------------------|-------|
| `SignInView.swift` | `Views/Components/Auth/SignInView.swift` | ⬜ **TODO** | User authentication |
| `SignUpView.swift` | `Views/Components/Auth/SignUpView.swift` | ⬜ **TODO** | User registration |
| `BiometricSignInView.swift` | `Views/Components/Auth/BiometricSignInView.swift` | ⬜ **TODO** | Biometric authentication |
| `BiometricSetupView.swift` | `Views/Components/Auth/BiometricSetupView.swift` | ⬜ **TODO** | Biometric setup |
| `GuestEmailModal.swift` | `Views/Components/Auth/GuestEmailModal.swift` | ⬜ **TODO** | Guest user flow |

### 🔄 **PRIORITY 4 - Seat Map Components (Need Migration)**
| Legacy File | Target Location | Migration Status | Notes |
|-------------|-----------------|------------------|-------|
| `SeatMapCanvas.swift` | `Views/Components/SeatMap/SeatMapCanvas.swift` | ⬜ **TODO** | Basic seat rendering |
| `HamiltonSeatMapCanvas.swift` | `Views/Components/SeatMap/SpecializedCanvas.swift` | ⬜ **TODO** | Show-specific rendering |
| `HierarchicalSeatMapCanvas.swift` | `Views/Components/SeatMap/HierarchicalCanvas.swift` | ⬜ **TODO** | Complex seat layouts |

### 🔄 **PRIORITY 5 - Atomic Components (Need Migration)**
| Legacy Directory | Target Location | Migration Status | Count |
|------------------|-----------------|------------------|-------|
| `Atoms/Buttons/` | `Views/Components/Buttons/` | ⬜ **TODO** | 2 files |
| `Atoms/Cards/` | `Views/Components/Cards/` | ⬜ **TODO** | ~5 files |
| `Atoms/Text/` | `Views/Components/Text/` | ⬜ **TODO** | ~3 files |
| `Atoms/Images/` | `Views/Components/Images/` | ⬜ **TODO** | ~2 files |
| `Atoms/Badges/` | `Views/Components/Badges/` | ⬜ **TODO** | ~2 files |

### 🔄 **PRIORITY 6 - Molecular Components (Need Migration)**
| Legacy Directory | Target Location | Migration Status | Count |
|------------------|-----------------|------------------|-------|
| `Molecules/Authentication/` | `Views/Components/Auth/` | ⬜ **TODO** | 1 file |
| `Molecules/Theater/` | `Views/Components/Theater/` | ⬜ **TODO** | ~3 files |
| `Molecules/Cards/` | `Views/Components/Cards/` | ⬜ **TODO** | ~4 files |
| `Molecules/Tickets/` | `Views/Components/Tickets/` | ⬜ **TODO** | ~3 files |
| `Molecules/Loading/` | `Views/Components/Loading/` | ⬜ **TODO** | ~2 files |
| `Molecules/States/` | `Views/Components/States/` | ⬜ **TODO** | ~4 files |
| `Molecules/Profile/` | `Views/Components/Profile/` | ⬜ **TODO** | ~3 files |
| `Molecules/Buttons/` | `Views/Components/Buttons/` | ⬜ **TODO** | ~2 files |

---

## 📁 Proposed Clean Directory Structure

```
rebuild/v1-foundation/ios/LML/
├── LMLApp.swift                    ✅ DONE
├── ContentView.swift               ✅ DONE (temp)
├── Info.plist                     ✅ DONE
├── Core/
│   ├── Models/                     ✅ DONE
│   │   ├── Show.swift             ✅ DONE
│   │   ├── SeatMap.swift          ✅ DONE
│   │   └── Booking.swift          ✅ DONE
│   ├── Services/                   ✅ DONE
│   │   └── APIClient.swift        ✅ DONE
│   └── Utils/                      ✅ DONE
│       └── Environment.swift      ✅ DONE
├── Views/
│   ├── Screens/                    ⬜ TODO
│   │   ├── HomeView.swift         ⬜ TODO
│   │   ├── AccountView.swift      ⬜ TODO
│   │   ├── TicketsView.swift      ⬜ TODO
│   │   ├── SeatMapView.swift      ⬜ TODO
│   │   └── TicketDetailView.swift ⬜ TODO
│   ├── ViewModels/                 ⬜ TODO
│   │   ├── AccountViewModel.swift ⬜ TODO
│   │   └── TicketsViewModel.swift ⬜ TODO
│   ├── Components/
│   │   ├── Auth/                   ⬜ TODO
│   │   │   ├── SignInView.swift   ⬜ TODO
│   │   │   ├── SignUpView.swift   ⬜ TODO
│   │   │   └── BiometricViews.swift ⬜ TODO
│   │   ├── SeatMap/                ⬜ TODO
│   │   │   ├── SeatMapCanvas.swift ⬜ TODO
│   │   │   └── SpecializedCanvas.swift ⬜ TODO
│   │   ├── Buttons/                ⬜ TODO
│   │   ├── Cards/                  ⬜ TODO
│   │   ├── Theater/                ⬜ TODO
│   │   ├── Tickets/                ⬜ TODO
│   │   ├── Loading/                ⬜ TODO
│   │   └── States/                 ⬜ TODO
│   └── SeatMap/                    ✅ DONE
│       └── SeatMapViewModel.swift  ✅ DONE
└── Assets.xcassets/                ✅ DONE
```

---

## 🚀 Migration Strategy

### **Phase 2.1: Main Screens (Week 1)**
1. **HomeView.swift** - Show listing with v1 API integration
2. **ContentView.swift** - Tab navigation system
3. **AccountView.swift** - User authentication and profile  
4. **TicketsView.swift** - User ticket management
5. **SeatMapView.swift** - Universal seat selection (replacing Hamilton-specific)

### **Phase 2.2: ViewModels (Week 1-2)**
1. **AccountViewModel.swift** - Clean authentication logic
2. **TicketsViewModel.swift** - Ticket fetching and management
3. **Specialized ViewModels** - Show-specific business logic

### **Phase 2.3: Authentication Flow (Week 2)**
1. **SignInView.swift** - User login
2. **SignUpView.swift** - User registration  
3. **BiometricViews.swift** - Touch/Face ID integration
4. **GuestEmailModal.swift** - Guest booking flow

### **Phase 2.4: SeatMap Components (Week 2-3)**
1. **SeatMapCanvas.swift** - Universal seat rendering
2. **SpecializedCanvas.swift** - Show-specific layouts
3. **HierarchicalCanvas.swift** - Complex venue layouts

### **Phase 2.5: Atomic/Molecular Components (Week 3)**
1. **Priority Order:** Buttons → Cards → States → Loading → Others
2. **Clean Implementation:** Remove legacy dependencies
3. **v1 API Integration:** Update all data fetching
4. **Testing:** Add unit tests for each component

---

## 🔧 Migration Guidelines

### **DO's:**
- ✅ **Copy presentation logic** - Pure UI components are safe
- ✅ **Update API calls** - Use v1 APIClient for all data fetching
- ✅ **Simplify ViewModels** - Remove fallback and retry logic
- ✅ **Add unit tests** - Test all business logic
- ✅ **Follow new patterns** - Use established clean conventions

### **DON'Ts:**
- ❌ **Copy business logic as-is** - Must be cleaned and simplified
- ❌ **Keep fallback systems** - Use only v1 API endpoints
- ❌ **Hardcode environment URLs** - Use Environment configuration
- ❌ **Skip error handling** - Add proper error states
- ❌ **Mix legacy patterns** - Follow clean architecture

### **Key Changes Required:**
1. **API Integration:** Replace all legacy API calls with v1 endpoints
2. **State Management:** Simplify complex state flows
3. **Error Handling:** Use consistent error presentation
4. **Environment Config:** Use centralized configuration
5. **Navigation:** Remove swipe-back, use manual navigation

---

## 🧪 Testing Strategy

### **Per-Component Testing:**
- **Unit Tests:** All ViewModels and business logic
- **UI Tests:** Critical user flows
- **Integration Tests:** v1 API communication
- **Performance Tests:** Seat map rendering with large datasets

### **Migration Validation:**
- ✅ Component builds without errors
- ✅ v1 API integration works
- ✅ Error states display properly
- ✅ No legacy dependencies remain
- ✅ Follows clean architecture patterns

---

## 📊 Migration Progress Tracking

### **Estimated Timeline:**
- **Phase 2.1 (Main Screens):** 5 days
- **Phase 2.2 (ViewModels):** 3 days  
- **Phase 2.3 (Authentication):** 4 days
- **Phase 2.4 (SeatMap Components):** 5 days
- **Phase 2.5 (Atomic Components):** 7 days
- **Testing & Polish:** 3 days

**Total Estimated:** 27 days

### **Success Criteria:**
- ✅ All legacy views migrated and functional
- ✅ Complete end-to-end user flows working
- ✅ v1 API integration throughout
- ✅ No fallback logic in any component
- ✅ Portrait orientation enforced
- ✅ Swipe navigation disabled
- ✅ Unit test coverage >80%

---

## 🔜 Next Steps

### **Immediate Actions:**
1. **Test Xcode build** - Verify project compiles successfully
2. **Start Phase 2.1** - Begin with HomeView.swift migration
3. **Set up CI/CD** - Automated building and testing
4. **Documentation** - Update README with migration progress

### **Weekly Check-ins:**
- **Monday:** Review migration progress vs. plan  
- **Wednesday:** Test integrated components end-to-end
- **Friday:** Update migration status and resolve blockers

---

**🎯 Goal: Complete iOS view migration while maintaining the clean, no-fallback architecture established in Phase 2.**