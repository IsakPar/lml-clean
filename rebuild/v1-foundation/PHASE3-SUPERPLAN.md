# 🎯 Phase 3 Superplan: Production-Grade Ticket Booking System

## 📋 **OVERVIEW**

**Goal**: Build a complete PostgreSQL + Redis booking infrastructure for Last Minute Live  
**Scope**: MVP booking system with Stripe integration, real-time seat locking, and anti-fraud protection  
**Dependencies**: MongoDB venue layouts (✅ completed), deterministic seat IDs (✅ ready)  
**Timeline**: 4-6 implementation phases after approval  

---

## 🗃️ **1. POSTGRESQL SCHEMA DESIGN**

### **Core Tables Structure**

```sql
-- =====================================
-- 1. ORGANIZATIONAL & USER MANAGEMENT
-- =====================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    stripe_account_id VARCHAR(255), -- Stripe Connect account
    payout_enabled BOOLEAN DEFAULT false,
    fee_percentage DECIMAL(5,2) DEFAULT 10.00, -- LML commission
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    stripe_customer_id VARCHAR(255), -- Stripe customer reference
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- User preferences
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false}',
    booking_limits JSONB DEFAULT '{"max_per_event": 10, "max_pending": 5}'
);

-- =====================================
-- 2. VENUE & EVENT MANAGEMENT  
-- =====================================

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    address JSONB, -- {street, city, country, postal_code, coordinates}
    mongo_layout_id VARCHAR(255), -- Reference to MongoDB layout
    capacity INTEGER DEFAULT 0,
    venue_metadata JSONB DEFAULT '{}', -- Accessibility, parking, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    doors_open TIMESTAMPTZ,
    event_end TIMESTAMPTZ,
    
    -- Sales windows
    sales_start TIMESTAMPTZ DEFAULT NOW(),
    sales_end TIMESTAMPTZ,
    
    -- Event metadata
    event_type VARCHAR(50) DEFAULT 'general', -- concert, theater, sports, etc.
    age_restriction INTEGER, -- Minimum age
    event_metadata JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, published, canceled, completed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================
-- 3. TICKET CATEGORIES & PRICING
-- =====================================

CREATE TABLE ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- "Premium", "Standard", "VIP"
    description TEXT,
    price_cents INTEGER NOT NULL, -- Price in cents to avoid floating point
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Inventory limits
    max_quantity INTEGER,
    available_quantity INTEGER,
    
    -- Sales restrictions
    max_per_user INTEGER DEFAULT 10,
    requires_approval BOOLEAN DEFAULT false,
    
    -- Category metadata  
    category_metadata JSONB DEFAULT '{}', -- Benefits, restrictions, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================
-- 4. FINITE STATE MACHINE - BOOKING STATES
-- =====================================

CREATE TYPE booking_status AS ENUM (
    'draft',           -- User building cart
    'pending',         -- Payment processing
    'payment_pending', -- Awaiting payment confirmation
    'confirmed',       -- Payment successful, tickets issued
    'partially_paid',  -- Partial payment received
    'canceled',        -- User or system canceled
    'refunded',        -- Payment refunded
    'expired',         -- Booking expired before payment
    'disputed',        -- Payment disputed/chargeback
    'fraud_hold'       -- Suspected fraud, manual review needed
);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Booking status and workflow
    status booking_status DEFAULT 'draft',
    previous_status booking_status,
    status_changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Financial information
    total_amount_cents INTEGER DEFAULT 0,
    fee_amount_cents INTEGER DEFAULT 0, -- LML commission
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Stripe integration
    stripe_checkout_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    stripe_refund_id VARCHAR(255),
    
    -- Booking metadata
    booking_channel VARCHAR(50) DEFAULT 'web', -- web, mobile, api, admin
    booking_metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================
-- 5. SEAT BOOKING STATE (CORE FSM)
-- =====================================

CREATE TYPE seat_booking_status AS ENUM (
    'available',       -- Seat is free to book
    'locked',          -- Temporarily held (Redis TTL backup)
    'booked',          -- Successfully booked and paid
    'reserved',        -- Admin reserved (not for sale)
    'blocked',         -- Maintenance/accessibility block
    'released'         -- Previously booked, now released
);

CREATE TABLE seat_booking_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Seat identification (links to MongoDB)
    seat_id VARCHAR(64) NOT NULL, -- SHA-256 from MongoDB
    section VARCHAR(100) NOT NULL,
    row VARCHAR(10) NOT NULL,
    seat_number INTEGER NOT NULL,
    
    -- Current state
    status seat_booking_status DEFAULT 'available',
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    ticket_category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    
    -- Lock management (Redis backup)
    locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_until TIMESTAMPTZ,
    lock_key VARCHAR(255), -- Redis key reference
    
    -- State transition tracking
    previous_status seat_booking_status,
    status_changed_at TIMESTAMPTZ DEFAULT NOW(),
    status_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Constraints and metadata
    price_override_cents INTEGER, -- Specific pricing for this seat
    seat_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one seat per event
    UNIQUE(event_id, seat_id)
);

-- =====================================
-- 6. TICKETS & TRANSACTIONS
-- =====================================

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    seat_booking_state_id UUID REFERENCES seat_booking_state(id) ON DELETE CASCADE,
    ticket_category_id UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    
    -- Ticket identification
    ticket_number VARCHAR(20) UNIQUE NOT NULL, -- Human-readable ticket ID
    qr_hash VARCHAR(64) UNIQUE NOT NULL, -- QR code hash for validation
    
    -- Ticket details
    seat_id VARCHAR(64) NOT NULL, -- MongoDB seat reference
    section VARCHAR(100) NOT NULL,
    row VARCHAR(10) NOT NULL,
    seat_number INTEGER NOT NULL,
    
    -- Pricing
    price_paid_cents INTEGER NOT NULL,
    fees_paid_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Ticket status
    ticket_status VARCHAR(20) DEFAULT 'valid', -- valid, used, canceled, refunded
    used_at TIMESTAMPTZ, -- When ticket was scanned
    
    -- Metadata
    ticket_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL, -- payment, refund, payout, fee
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Stripe references
    stripe_payment_intent_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255), -- For venue payouts
    stripe_refund_id VARCHAR(255),
    
    -- Transaction status
    status VARCHAR(20) DEFAULT 'pending', -- pending, succeeded, failed, canceled
    failure_reason TEXT,
    
    -- Reconciliation
    reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    
    -- Metadata
    transaction_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================
-- 7. AUDIT TRAIL & FRAUD PREVENTION
-- =====================================

CREATE TABLE booking_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- State change tracking
    action VARCHAR(50) NOT NULL, -- created, payment_started, confirmed, etc.
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    triggered_by VARCHAR(20) DEFAULT 'user', -- user, system, admin, stripe
    
    -- Additional data
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fraud_detection_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    
    -- Fraud indicators
    risk_score INTEGER DEFAULT 0, -- 0-100 risk score
    risk_factors JSONB DEFAULT '[]', -- Array of risk indicators
    
    -- Detection details
    detection_type VARCHAR(50), -- velocity, location, payment, behavioral
    triggered_rule VARCHAR(100),
    
    -- Action taken
    action VARCHAR(20) DEFAULT 'flag', -- flag, block, manual_review, allow
    reviewed BOOLEAN DEFAULT false,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================
-- 8. INDEXES FOR PERFORMANCE
-- =====================================

-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);

-- Event and venue lookups
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_organization ON events(organization_id);
CREATE INDEX idx_venues_organization ON venues(organization_id);

-- Booking state and seat management
CREATE INDEX idx_seat_booking_event_status ON seat_booking_state(event_id, status);
CREATE INDEX idx_seat_booking_seat_id ON seat_booking_state(seat_id);
CREATE INDEX idx_seat_booking_locked_until ON seat_booking_state(locked_until) WHERE status = 'locked';

-- Booking and payment tracking
CREATE INDEX idx_bookings_user_status ON bookings(user_id, status);
CREATE INDEX idx_bookings_event_status ON bookings(event_id, status);
CREATE INDEX idx_bookings_stripe_session ON bookings(stripe_checkout_session_id);
CREATE INDEX idx_tickets_qr_hash ON tickets(qr_hash);
CREATE INDEX idx_transactions_booking ON payment_transactions(booking_id);

-- Audit and fraud detection
CREATE INDEX idx_audit_booking ON booking_audit_log(booking_id);
CREATE INDEX idx_audit_user_created ON booking_audit_log(user_id, created_at);
CREATE INDEX idx_fraud_user_created ON fraud_detection_log(user_id, created_at);
```

---

## 🧠 **2. REDIS KEY STRUCTURE & LOCKING STRATEGY**

### **Redis Key Patterns**

```redis
# =====================================
# SEAT LOCKING SYSTEM
# =====================================

# Seat lock pattern: seat_lock:{event_id}:{seat_id}
# Value: {user_id}:{timestamp}:{booking_id}
# TTL: 600 seconds (10 minutes)
seat_lock:evt_12345:abc123def456... = "user_789:1640995200:booking_456"

# Lock ownership verification
lock_owner:{user_id}:{event_id} = ["seat_id1", "seat_id2", ...]
# TTL: 900 seconds (15 minutes - longer than seat locks)

# =====================================
# CONFLICT RESOLUTION
# =====================================

# Multiple users trying to lock same seat
conflict_queue:evt_12345:abc123def456... = ["user_789", "user_101", "user_202"]
# FIFO queue for fair lock acquisition
# TTL: 300 seconds (5 minutes)

# =====================================
# BOOKING STATE CACHE
# =====================================

# Event seat availability cache (fast lookups)
event_seats:evt_12345:available = ["seat_id1", "seat_id2", ...]
event_seats:evt_12345:locked = ["seat_id3", "seat_id4", ...]
event_seats:evt_12345:booked = ["seat_id5", "seat_id6", ...]
# TTL: 60 seconds (frequent refresh from PostgreSQL)

# User active bookings cache
user_bookings:user_789:active = ["booking_456", "booking_789"]
# TTL: 300 seconds (5 minutes)

# =====================================
# RATE LIMITING & FRAUD PREVENTION
# =====================================

# Rate limiting per user per event
rate_limit:booking:user_789:evt_12345 = 3
# TTL: 3600 seconds (1 hour)

# Velocity tracking
user_velocity:user_789:hourly = 5
user_velocity:user_789:daily = 23
# TTL: Based on window (1 hour, 24 hours)

# IP-based rate limiting
rate_limit:ip:192.168.1.100:evt_12345 = 10
# TTL: 3600 seconds (1 hour)
```

### **Redis Locking Algorithm**

```python
# Pseudo-code for seat locking
def acquire_seat_lock(event_id, seat_id, user_id, booking_id):
    lock_key = f"seat_lock:{event_id}:{seat_id}"
    lock_value = f"{user_id}:{timestamp()}:{booking_id}"
    
    # Step 1: Attempt atomic lock acquisition
    if redis.set(lock_key, lock_value, nx=True, ex=600):
        # Lock acquired successfully
        add_to_user_locks(user_id, event_id, seat_id)
        return {"success": True, "lock_key": lock_key}
    
    # Step 2: Check if lock is expired (PostgreSQL fallback)
    current_lock = redis.get(lock_key)
    if not current_lock:
        # Lock expired, try again
        return acquire_seat_lock(event_id, seat_id, user_id, booking_id)
    
    # Step 3: Add to conflict queue for fair access
    queue_key = f"conflict_queue:{event_id}:{seat_id}"
    redis.lpush(queue_key, user_id)
    redis.expire(queue_key, 300)
    
    return {"success": False, "reason": "seat_locked", "queue_position": get_queue_position(queue_key, user_id)}

def release_seat_lock(event_id, seat_id, user_id):
    lock_key = f"seat_lock:{event_id}:{seat_id}"
    lock_value = redis.get(lock_key)
    
    # Verify ownership before releasing
    if lock_value and lock_value.startswith(f"{user_id}:"):
        redis.delete(lock_key)
        remove_from_user_locks(user_id, event_id, seat_id)
        
        # Process conflict queue
        queue_key = f"conflict_queue:{event_id}:{seat_id}"
        next_user = redis.rpop(queue_key)
        if next_user:
            notify_user_lock_available(next_user, event_id, seat_id)
        
        return True
    return False
```

---

## 🔄 **3. FINITE STATE MACHINE (FSM) TRANSITIONS**

### **Booking Status FSM**

```
    draft ──────────────────────┐
      │                         │
      │ start_payment()          │ cancel()
      ▼                         │
   pending ─────────────────────┤
      │                         │
      │ payment_processing()     │
      ▼                         │
payment_pending ────────────────┤
      │                         │
      │ payment_success()        │
      ▼                         │
   confirmed ◄──────────────────┘
      │
      │ request_refund()
      ▼
   refunded
      
   expired ◄── (timeout from pending/payment_pending)
   
   disputed ◄── (Stripe webhook: dispute created)
   
   fraud_hold ◄── (fraud detection triggers)
```

### **Seat Booking Status FSM**

```
  available ──────────────────┐
      │                       │
      │ lock()                │ admin_block()
      ▼                       │
    locked ───────────────────┤
      │                       │
      │ confirm_booking()      │ release() / timeout
      ▼                       │
    booked ◄──────────────────┘
      │
      │ release_booking()
      ▼
   released ──────────────────┐
      │                       │
      │ make_available()       │
      ▼                       │
   available ◄────────────────┘
   
   reserved ◄── (admin reservation)
   
   blocked ◄── (maintenance/accessibility)
```

### **State Transition Rules**

```typescript
// State transition validation
const VALID_BOOKING_TRANSITIONS = {
  'draft': ['pending', 'canceled', 'expired'],
  'pending': ['payment_pending', 'confirmed', 'canceled', 'expired'],
  'payment_pending': ['confirmed', 'canceled', 'expired', 'fraud_hold'],
  'confirmed': ['refunded', 'disputed'],
  'canceled': [], // Terminal state
  'refunded': [], // Terminal state
  'expired': [], // Terminal state
  'disputed': ['refunded', 'confirmed'], // Can be resolved
  'fraud_hold': ['confirmed', 'canceled'] // After manual review
};

const VALID_SEAT_TRANSITIONS = {
  'available': ['locked', 'reserved', 'blocked'],
  'locked': ['booked', 'available', 'reserved', 'blocked'],
  'booked': ['released', 'blocked'],
  'reserved': ['available', 'blocked'],
  'blocked': ['available', 'reserved'],
  'released': ['available']
};
```

---

## 💳 **4. STRIPE INTEGRATION TOUCHPOINTS**

### **Payment Flow Integration**

```typescript
// Stripe Checkout Session Creation
interface CheckoutSessionData {
  booking_id: string;
  user_id: string;
  event_id: string;
  line_items: Array<{
    seat_id: string;
    price_cents: number;
    quantity: 1;
  }>;
  total_amount_cents: number;
  fee_amount_cents: number;
  metadata: {
    booking_id: string;
    event_id: string;
    seat_ids: string; // Comma-separated
  };
}

// Webhook Event Handling
const STRIPE_WEBHOOK_HANDLERS = {
  'checkout.session.completed': handlePaymentSuccess,
  'payment_intent.payment_failed': handlePaymentFailure,
  'payment_intent.succeeded': handlePaymentConfirmation,
  'charge.dispute.created': handleDispute,
  'invoice.payment_failed': handleSubscriptionFailure, // Future: subscription events
  'account.updated': handleAccountStatusChange, // Venue Stripe Connect
};

// Venue Payout Integration (Stripe Connect)
interface PayoutCalculation {
  gross_amount_cents: number;
  lml_fee_cents: number; // 10% default
  stripe_fee_cents: number; // Stripe's processing fee
  net_payout_cents: number; // Amount to venue
  transfer_id: string; // Stripe Transfer ID
}
```

### **Anti-Fraud Stripe Integration**

```typescript
// Radar Rules Integration
interface FraudCheckData {
  stripe_payment_intent_id: string;
  radar_risk_score: number;
  radar_risk_level: 'low' | 'medium' | 'high' | 'highest';
  blocked_by_radar: boolean;
  recommended_action: 'allow' | 'review' | 'block';
}

// Refund Handling
interface RefundRequest {
  booking_id: string;
  refund_type: 'full' | 'partial';
  amount_cents?: number; // For partial refunds
  reason: 'requested_by_customer' | 'duplicate' | 'fraudulent';
  reversal_timeline: 'immediate' | 'standard'; // 5-10 business days
}
```

---

## 🌐 **5. API STRUCTURE & ENDPOINTS**

### **Authentication & User Management**

```typescript
// Auth endpoints
POST   /api/v1/auth/register          // User registration
POST   /api/v1/auth/login             // User login
POST   /api/v1/auth/refresh           // Refresh JWT tokens
POST   /api/v1/auth/logout            // User logout
POST   /api/v1/auth/verify-email      // Email verification
POST   /api/v1/auth/reset-password    // Password reset

// User management
GET    /api/v1/users/profile          // Get user profile
PUT    /api/v1/users/profile          // Update user profile
GET    /api/v1/users/bookings         // User's booking history
GET    /api/v1/users/tickets          // User's active tickets
```

### **Event & Venue Discovery**

```typescript
// Public event browsing
GET    /api/v1/events                 // List events (paginated, filtered)
GET    /api/v1/events/{slug}          // Get event details
GET    /api/v1/events/{id}/availability // Get seat availability
GET    /api/v1/venues/{slug}          // Get venue details
GET    /api/v1/venues/{id}/layout     // Get venue layout (MongoDB reference)

// Event search and filtering
GET    /api/v1/events/search?q={query}&date={date}&location={city}
GET    /api/v1/events/categories      // Event categories/types
```

### **Booking Workflow**

```typescript
// Core booking flow
POST   /api/v1/bookings              // Create new booking (draft status)
PUT    /api/v1/bookings/{id}         // Update booking (add/remove seats)
POST   /api/v1/bookings/{id}/lock-seats // Lock seats for booking
DELETE /api/v1/bookings/{id}/unlock-seats // Release seat locks
POST   /api/v1/bookings/{id}/checkout // Create Stripe checkout session
GET    /api/v1/bookings/{id}         // Get booking details
DELETE /api/v1/bookings/{id}         // Cancel booking

// Seat management
POST   /api/v1/seats/lock            // Lock specific seats
POST   /api/v1/seats/unlock          // Release specific seats
GET    /api/v1/seats/availability/{event_id} // Real-time availability
```

### **Payment & Ticketing**

```typescript
// Payment processing
POST   /api/v1/payments/create-checkout // Create Stripe checkout
POST   /api/v1/payments/webhooks      // Stripe webhook handler
GET    /api/v1/payments/{booking_id}/status // Payment status
POST   /api/v1/payments/{booking_id}/refund // Request refund

// Ticket management
GET    /api/v1/tickets/{ticket_id}    // Get ticket details
POST   /api/v1/tickets/{ticket_id}/validate // Validate ticket at entry
GET    /api/v1/tickets/{ticket_id}/qr // Get QR code for ticket
POST   /api/v1/tickets/{ticket_id}/transfer // Transfer ticket to another user
```

### **Admin & Organization Management**

```typescript
// Organization management
GET    /api/v1/admin/organizations    // List organizations
POST   /api/v1/admin/organizations    // Create organization
PUT    /api/v1/admin/organizations/{id} // Update organization
GET    /api/v1/admin/organizations/{id}/analytics // Revenue/booking analytics

// Event management
GET    /api/v1/admin/events           // List organization events
POST   /api/v1/admin/events           // Create new event
PUT    /api/v1/admin/events/{id}      // Update event
DELETE /api/v1/admin/events/{id}      // Cancel event
GET    /api/v1/admin/events/{id}/bookings // Event booking analytics

// Financial management
GET    /api/v1/admin/payouts          // Payout history
POST   /api/v1/admin/payouts/calculate // Calculate pending payouts
GET    /api/v1/admin/transactions     // Transaction history
GET    /api/v1/admin/reconciliation   // Financial reconciliation report
```

### **Real-time & Monitoring**

```typescript
// WebSocket endpoints for real-time updates
WS     /api/v1/ws/seat-updates/{event_id} // Real-time seat availability
WS     /api/v1/ws/booking-status/{booking_id} // Booking status updates

// Health and monitoring
GET    /api/v1/health                 // System health check
GET    /api/v1/health/redis           // Redis connectivity
GET    /api/v1/health/postgres        // PostgreSQL connectivity
GET    /api/v1/metrics                // Performance metrics
```

---

## 🛡️ **6. AUDIT TRAIL & ANTI-FRAUD DESIGN**

### **Comprehensive Audit Strategy**

```typescript
// Audit Event Types
const AUDIT_EVENTS = {
  // User actions
  'user.registration': 'User account created',
  'user.login': 'User logged in',
  'user.profile_update': 'User profile modified',
  
  // Booking workflow
  'booking.created': 'New booking initiated',
  'booking.seat_added': 'Seat added to booking',
  'booking.seat_removed': 'Seat removed from booking',
  'booking.payment_started': 'Payment process initiated',
  'booking.confirmed': 'Booking confirmed and paid',
  'booking.canceled': 'Booking canceled',
  'booking.expired': 'Booking expired',
  
  // Payment events
  'payment.processing': 'Payment being processed',
  'payment.succeeded': 'Payment completed successfully',
  'payment.failed': 'Payment failed',
  'payment.refunded': 'Payment refunded',
  'payment.disputed': 'Payment disputed/chargeback',
  
  // Fraud and security
  'fraud.risk_detected': 'Fraud risk indicators triggered',
  'fraud.blocked': 'Transaction blocked due to fraud',
  'security.suspicious_activity': 'Suspicious user behavior detected',
  
  // Administrative
  'admin.user_modified': 'Admin modified user account',
  'admin.event_created': 'Admin created new event',
  'admin.payout_processed': 'Venue payout processed'
};

// Audit Context Capture
interface AuditContext {
  user_id?: string;
  booking_id?: string;
  event_id?: string;
  ip_address: string;
  user_agent: string;
  session_id: string;
  timestamp: Date;
  request_id: string; // For correlation
  geolocation?: {
    country: string;
    city: string;
    coordinates: [number, number];
  };
}
```

### **Multi-Layer Fraud Prevention**

```typescript
// Fraud Detection Rules Engine
interface FraudRule {
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'flag' | 'slow_down' | 'require_verification' | 'block';
  condition: (context: FraudContext) => boolean;
}

const FRAUD_RULES: FraudRule[] = [
  {
    name: 'velocity_check_hourly',
    severity: 'medium',
    action: 'slow_down',
    condition: (ctx) => ctx.user_bookings_last_hour > 5
  },
  {
    name: 'velocity_check_daily',  
    severity: 'high',
    action: 'require_verification',
    condition: (ctx) => ctx.user_bookings_last_24h > 20
  },
  {
    name: 'new_user_high_value',
    severity: 'high',
    action: 'require_verification',
    condition: (ctx) => ctx.user_age_days < 1 && ctx.booking_value_cents > 50000
  },
  {
    name: 'geographic_anomaly',
    severity: 'medium',
    action: 'flag',
    condition: (ctx) => ctx.location_distance_km > 1000 && ctx.time_since_last_login_hours < 1
  },
  {
    name: 'payment_method_mismatch',
    severity: 'critical',
    action: 'block',
    condition: (ctx) => ctx.payment_country !== ctx.user_country && ctx.payment_country_risk_score > 70
  },
  {
    name: 'bulk_booking_pattern',
    severity: 'high',
    action: 'require_verification',
    condition: (ctx) => ctx.seats_requested > 10 && ctx.booking_speed_seconds < 30
  }
];

// Risk Scoring Algorithm
interface RiskFactors {
  user_age_penalty: number;        // New users = higher risk
  velocity_score: number;          // Booking frequency
  geographic_risk: number;         // Location-based risk
  payment_risk: number;           // Payment method risk
  behavioral_anomaly: number;     // Unusual patterns
  device_fingerprint_risk: number; // Device/browser risk
}

function calculateRiskScore(factors: RiskFactors): number {
  const weights = {
    user_age_penalty: 0.15,
    velocity_score: 0.25,
    geographic_risk: 0.20,
    payment_risk: 0.20,
    behavioral_anomaly: 0.15,
    device_fingerprint_risk: 0.05
  };
  
  return Object.entries(factors).reduce((total, [factor, value]) => {
    return total + (value * weights[factor]);
  }, 0);
}
```

### **Edge Cases & Error Handling**

```typescript
// Critical Edge Cases to Handle
const EDGE_CASES = {
  // Concurrent booking conflicts
  'double_booking': {
    scenario: 'Two users try to book same seat simultaneously',
    solution: 'Redis atomic locks + PostgreSQL constraint validation',
    fallback: 'Conflict queue with FIFO processing'
  },
  
  // Payment edge cases
  'payment_timeout': {
    scenario: 'Payment processing takes longer than seat lock TTL',
    solution: 'Extend lock during payment processing',
    fallback: 'Grace period + manual review queue'
  },
  
  'partial_payment_failure': {
    scenario: 'Payment succeeds but booking update fails',
    solution: 'Idempotent operations + reconciliation job',
    fallback: 'Manual reconciliation with audit trail'
  },
  
  // System failures
  'redis_unavailable': {
    scenario: 'Redis cluster down during peak booking',
    solution: 'PostgreSQL-only fallback mode',
    fallback: 'Degraded performance but functional booking'
  },
  
  'stripe_webhook_delay': {
    scenario: 'Stripe webhook delayed or lost',
    solution: 'Polling backup + manual reconciliation',
    fallback: 'Payment verification via Stripe API'
  },
  
  // Data consistency
  'seat_count_mismatch': {
    scenario: 'MongoDB layout vs PostgreSQL bookings mismatch',
    solution: 'Regular reconciliation jobs',
    fallback: 'Administrative correction tools'
  }
};

// Error Recovery Strategies
interface ErrorRecoveryStrategy {
  automatic_retry: boolean;
  retry_count: number;
  backoff_strategy: 'linear' | 'exponential';
  fallback_action: string;
  manual_intervention_required: boolean;
  escalation_threshold: number;
}
```

---

## 👥 **7. USER & ORGANIZATION DATA MODEL**

### **Multi-Tenant Architecture**

```typescript
// Organization Hierarchy
interface OrganizationStructure {
  organization: {
    id: string;
    name: string;
    type: 'venue_owner' | 'event_promoter' | 'ticketing_reseller';
    subscription_tier: 'basic' | 'pro' | 'enterprise';
    stripe_connect_account: string;
    commission_rate: number; // Custom rate negotiation
  };
  
  venues: Array<{
    id: string;
    organization_id: string;
    mongo_layout_id: string; // Links to our completed MongoDB system
    capacity_limits: {
      max_events_per_month: number;
      max_attendees_per_event: number;
    };
  }>;
  
  users: Array<{
    id: string;
    role: 'admin' | 'manager' | 'staff' | 'customer';
    permissions: string[]; // RBAC permissions
    organization_access: string[]; // Multi-org access
  }>;
}

// User Permission System
const PERMISSIONS = {
  // Organization management
  'org.create': 'Create new organizations',
  'org.update': 'Update organization settings',
  'org.delete': 'Delete organization',
  'org.view_analytics': 'View organization analytics',
  
  // Venue management
  'venue.create': 'Create new venues',
  'venue.update': 'Update venue settings',
  'venue.manage_layout': 'Modify venue layouts',
  
  // Event management
  'event.create': 'Create new events',
  'event.update': 'Update event details',
  'event.cancel': 'Cancel events',
  'event.view_bookings': 'View event bookings',
  
  // Financial management
  'finance.view_reports': 'View financial reports',
  'finance.process_payouts': 'Process venue payouts',
  'finance.view_transactions': 'View transaction history',
  
  // User management
  'user.create': 'Create user accounts',
  'user.update': 'Update user profiles',
  'user.delete': 'Delete user accounts',
  'user.view_activity': 'View user activity logs',
  
  // Booking management
  'booking.create': 'Create bookings on behalf of users',
  'booking.cancel': 'Cancel user bookings',
  'booking.refund': 'Process refunds',
  'booking.view_all': 'View all bookings'
};

// Role-Based Access Control
const ROLES = {
  'super_admin': {
    permissions: Object.keys(PERMISSIONS), // All permissions
    scope: 'global'
  },
  'org_admin': {
    permissions: [
      'org.update', 'venue.create', 'venue.update', 'event.create', 
      'event.update', 'finance.view_reports', 'user.create', 'user.update'
    ],
    scope: 'organization'
  },
  'venue_manager': {
    permissions: [
      'venue.update', 'event.create', 'event.update', 
      'event.view_bookings', 'booking.view_all'
    ],
    scope: 'venue'
  },
  'customer': {
    permissions: ['booking.create'], // Own bookings only
    scope: 'self'
  }
};
```

### **User Behavior Analytics**

```typescript
// User Segmentation
interface UserSegment {
  segment_name: string;
  criteria: {
    booking_frequency: 'high' | 'medium' | 'low';
    average_spend: number;
    event_preferences: string[];
    loyalty_score: number;
    risk_level: 'low' | 'medium' | 'high';
  };
  marketing_actions: string[];
  booking_limits: {
    max_per_event: number;
    require_verification: boolean;
  };
}

// Customer Lifecycle Tracking
const USER_LIFECYCLE_STAGES = {
  'new_user': 'First 30 days, 0-1 bookings',
  'engaged': '2-5 bookings, active in last 90 days',
  'loyal': '5+ bookings, consistent activity',
  'vip': 'High value customer, preferential treatment',
  'at_risk': 'No activity in 90+ days',
  'churned': 'No activity in 180+ days'
};
```

---

## 🎯 **IMPLEMENTATION PRIORITY MATRIX**

### **Phase 3A: Core Foundation (Weeks 1-2)**
1. **PostgreSQL Schema Setup**: Users, organizations, events, venues
2. **Basic Redis Integration**: Seat locking with TTL
3. **Core API Endpoints**: Event listing, user registration, booking creation
4. **Simple State Machine**: draft → pending → confirmed

### **Phase 3B: Payment Integration (Weeks 3-4)**
1. **Stripe Checkout Integration**: Payment processing
2. **Webhook Handling**: Payment confirmation and failures
3. **Booking Confirmation Flow**: Seat assignment and ticket generation
4. **Basic Refund Support**: Full refunds only

### **Phase 3C: Advanced Features (Weeks 5-6)**
1. **Fraud Detection**: Basic rules engine
2. **Audit Trail**: Complete action logging
3. **Admin Dashboard**: Organization and event management
4. **Performance Optimization**: Database indexing and query optimization

### **Phase 3D: Production Hardening (Weeks 7-8)**
1. **Edge Case Handling**: Conflict resolution, error recovery
2. **Load Testing**: Concurrent booking simulation
3. **Security Audit**: Penetration testing and security review
4. **Documentation**: API documentation and deployment guides

---

## ⚠️ **RISKS & MITIGATION STRATEGIES**

### **Technical Risks**
- **Redis Failure**: PostgreSQL fallback mode with degraded performance
- **Payment Processing**: Idempotent operations and reconciliation jobs
- **Race Conditions**: Atomic operations and proper locking strategies
- **Data Consistency**: Regular reconciliation and constraint validation

### **Business Risks**
- **Fraud**: Multi-layer detection and manual review processes
- **Chargebacks**: Comprehensive audit trail and dispute management
- **Revenue Leakage**: Automated reconciliation and payout verification
- **Compliance**: PCI DSS compliance and data protection measures

---

## 📊 **SUCCESS METRICS**

### **Performance Targets**
- **Seat Lock Acquisition**: < 100ms (99th percentile)
- **Booking Confirmation**: < 2 seconds end-to-end
- **Payment Processing**: < 30 seconds average
- **API Response Times**: < 200ms for read operations

### **Business Metrics**
- **Booking Conversion Rate**: > 85% from lock to payment
- **Payment Success Rate**: > 98% for valid cards
- **Fraud Detection Rate**: < 0.1% false positives
- **System Uptime**: 99.9% availability during peak hours

---

**🛑 AWAITING APPROVAL TO PROCEED WITH IMPLEMENTATION**

This superplan provides the complete architecture for a production-grade ticket booking system. Upon approval, we will begin Phase 3A implementation with the core PostgreSQL schema and Redis locking system.