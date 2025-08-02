-- Last Minute Live - Clean Production Database Schema
-- =====================================================
-- PostgreSQL: Core Business Data Only (NO seatmap data)
-- Seatmap data lives in MongoDB for proper separation
-- 
-- MIGRATED TO: rebuild/v1-foundation/database/postgres/schema.sql
-- Migration Date: 2025-08-01
-- Status: FOUNDATION APPROVED ✅

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SHOWS TABLE - Core show information
-- =====================================================
CREATE TABLE shows (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,           -- 'phantom-her-majestys-2025'
    title VARCHAR(200) NOT NULL,                 -- 'The Phantom of the Opera'
    description TEXT,
    venue_name VARCHAR(200) NOT NULL,            -- 'Her Majesty's Theatre'
    venue_address TEXT,
    show_date DATE NOT NULL,
    show_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 150,        -- Show duration in minutes
    
    -- Pricing (in pence for precision)
    base_price_pence INTEGER NOT NULL,           -- Minimum seat price
    max_price_pence INTEGER NOT NULL,            -- Maximum seat price
    
    -- Capacity & Availability
    total_capacity INTEGER,                      -- Total seats in venue
    available_seats INTEGER,                     -- Currently available seats
    
    -- MongoDB References (clean separation)
    seatmap_venue_id VARCHAR(100),               -- Links to MongoDB: 'her-majestys-theatre'
    seatmap_show_slug VARCHAR(100),              -- Links to MongoDB: 'phantom-2025'
    
    -- Status & Metadata
    status VARCHAR(20) DEFAULT 'active',         -- 'active', 'sold_out', 'cancelled', 'draft'
    category VARCHAR(50) DEFAULT 'musical',      -- 'musical', 'play', 'opera', etc.
    age_rating VARCHAR(10) DEFAULT 'PG',         -- Age rating
    language VARCHAR(10) DEFAULT 'EN',           -- Language code
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT valid_status CHECK (status IN ('active', 'sold_out', 'cancelled', 'draft')),
    CONSTRAINT valid_capacity CHECK (total_capacity >= 0 AND available_seats >= 0),
    CONSTRAINT valid_pricing CHECK (base_price_pence > 0 AND max_price_pence >= base_price_pence)
);

-- Indexes for shows table
CREATE INDEX idx_shows_slug ON shows(slug);
CREATE INDEX idx_shows_date ON shows(show_date);
CREATE INDEX idx_shows_status ON shows(status);
CREATE INDEX idx_shows_venue ON shows(venue_name);
CREATE INDEX idx_shows_seatmap_refs ON shows(seatmap_venue_id, seatmap_show_slug);

-- =====================================================
-- BOOKINGS TABLE - Customer booking records
-- =====================================================
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE RESTRICT,
    
    -- Customer Information
    customer_email VARCHAR(255) NOT NULL,
    customer_first_name VARCHAR(100),
    customer_last_name VARCHAR(100),
    customer_phone VARCHAR(20),
    
    -- Booking Details
    booking_reference VARCHAR(20) UNIQUE NOT NULL,  -- Human-readable reference
    total_amount_pence INTEGER NOT NULL,            -- Total paid amount
    seat_count INTEGER NOT NULL,                    -- Number of seats booked
    
    -- Payment Status
    payment_status VARCHAR(20) DEFAULT 'pending',   -- 'pending', 'paid', 'failed', 'refunded'
    payment_intent_id VARCHAR(100),                 -- Stripe payment intent ID
    payment_method VARCHAR(50),                     -- 'card', 'apple_pay', etc.
    
    -- Booking Status  
    booking_status VARCHAR(20) DEFAULT 'confirmed', -- 'confirmed', 'cancelled', 'checked_in'
    validation_code VARCHAR(6),                     -- QR code for entry
    
    -- Timestamps
    booking_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    payment_date TIMESTAMP WITH TIME ZONE,
    cancelled_date TIMESTAMP WITH TIME ZONE,
    checked_in_date TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    CONSTRAINT valid_booking_status CHECK (booking_status IN ('confirmed', 'cancelled', 'checked_in')),
    CONSTRAINT valid_seat_count CHECK (seat_count > 0),
    CONSTRAINT valid_amount CHECK (total_amount_pence > 0)
);

-- Indexes for bookings table
CREATE INDEX idx_bookings_show_id ON bookings(show_id);
CREATE INDEX idx_bookings_email ON bookings(customer_email);
CREATE INDEX idx_bookings_reference ON bookings(booking_reference);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_validation_code ON bookings(validation_code);

-- =====================================================
-- BOOKING_SEATS TABLE - Individual seat bookings
-- =====================================================
CREATE TABLE booking_seats (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    
    -- Seat Reference (MongoDB seat ID)
    seat_id VARCHAR(100) NOT NULL,                  -- 'stalls-A-12' (from MongoDB)
    seat_section VARCHAR(50) NOT NULL,              -- 'Stalls', 'Dress Circle'
    seat_row VARCHAR(10) NOT NULL,                  -- 'A', 'B', '1', '2'
    seat_number INTEGER NOT NULL,                   -- 12, 15, etc.
    
    -- Pricing
    price_paid_pence INTEGER NOT NULL,              -- Price paid for this specific seat
    
    -- Status
    seat_status VARCHAR(20) DEFAULT 'booked',       -- 'booked', 'checked_in', 'no_show'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_seat_status CHECK (seat_status IN ('booked', 'checked_in', 'no_show')),
    CONSTRAINT valid_seat_price CHECK (price_paid_pence > 0),
    CONSTRAINT valid_seat_number CHECK (seat_number > 0),
    
    -- Ensure no double booking of same seat for same show
    UNIQUE(booking_id, seat_id)
);

-- Indexes for booking_seats table
CREATE INDEX idx_booking_seats_booking_id ON booking_seats(booking_id);
CREATE INDEX idx_booking_seats_seat_id ON booking_seats(seat_id);
CREATE INDEX idx_booking_seats_section ON booking_seats(seat_section);

-- =====================================================
-- USERS TABLE - User accounts (optional for guest bookings)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    
    -- Authentication
    password_hash VARCHAR(255),                     -- NULL for social auth users
    auth_provider VARCHAR(50) DEFAULT 'email',     -- 'email', 'google', 'apple'
    auth_provider_id VARCHAR(100),                 -- External provider user ID
    
    -- Preferences
    marketing_consent BOOLEAN DEFAULT false,
    email_notifications BOOLEAN DEFAULT true,
    
    -- Status
    account_status VARCHAR(20) DEFAULT 'active',   -- 'active', 'suspended', 'deleted'
    email_verified BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_account_status CHECK (account_status IN ('active', 'suspended', 'deleted')),
    CONSTRAINT valid_auth_provider CHECK (auth_provider IN ('email', 'google', 'apple', 'facebook'))
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);
CREATE INDEX idx_users_status ON users(account_status);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables that need auto-updated timestamps
CREATE TRIGGER update_shows_updated_at BEFORE UPDATE ON shows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate booking reference function
CREATE OR REPLACE FUNCTION generate_booking_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.booking_reference IS NULL THEN
        NEW.booking_reference := 'LML' || TO_CHAR(NOW(), 'YYMMDD') || LPAD(nextval('bookings_id_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Auto-generate booking reference
CREATE TRIGGER generate_booking_reference_trigger BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION generate_booking_reference();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Show summary with booking stats
CREATE VIEW show_summary AS
SELECT 
    s.id,
    s.slug,
    s.title,
    s.venue_name,
    s.show_date,
    s.show_time,
    s.total_capacity,
    s.available_seats,
    s.base_price_pence,
    s.max_price_pence,
    s.status,
    COALESCE(booking_stats.total_bookings, 0) as total_bookings,
    COALESCE(booking_stats.total_seats_booked, 0) as total_seats_booked,
    COALESCE(booking_stats.total_revenue_pence, 0) as total_revenue_pence
FROM shows s
LEFT JOIN (
    SELECT 
        show_id,
        COUNT(*) as total_bookings,
        SUM(seat_count) as total_seats_booked,
        SUM(total_amount_pence) as total_revenue_pence
    FROM bookings 
    WHERE payment_status = 'paid'
    GROUP BY show_id
) booking_stats ON s.id = booking_stats.show_id;

-- Booking details with seat information
CREATE VIEW booking_details AS
SELECT 
    b.id as booking_id,
    b.booking_reference,
    b.customer_email,
    b.customer_first_name,
    b.customer_last_name,
    s.title as show_title,
    s.venue_name,
    s.show_date,
    s.show_time,
    b.seat_count,
    b.total_amount_pence,
    b.payment_status,
    b.booking_status,
    b.validation_code,
    b.booking_date,
    array_agg(
        bs.seat_section || ' ' || bs.seat_row || '-' || bs.seat_number 
        ORDER BY bs.seat_section, bs.seat_row, bs.seat_number
    ) as seat_list
FROM bookings b
JOIN shows s ON b.show_id = s.id
LEFT JOIN booking_seats bs ON b.id = bs.booking_id
GROUP BY 
    b.id, b.booking_reference, b.customer_email, b.customer_first_name, 
    b.customer_last_name, s.title, s.venue_name, s.show_date, s.show_time,
    b.seat_count, b.total_amount_pence, b.payment_status, b.booking_status,
    b.validation_code, b.booking_date;

-- =====================================================
-- PERMISSIONS & SECURITY
-- =====================================================

-- Create application user with limited permissions
CREATE USER lml_app WITH PASSWORD 'lml_app_secure_pass';

-- Grant necessary permissions
GRANT CONNECT ON DATABASE lastminutelive_clean TO lml_app;
GRANT USAGE ON SCHEMA public TO lml_app;

-- Table permissions
GRANT SELECT, INSERT, UPDATE ON shows TO lml_app;
GRANT SELECT, INSERT, UPDATE ON bookings TO lml_app;
GRANT SELECT, INSERT, UPDATE ON booking_seats TO lml_app;
GRANT SELECT, INSERT, UPDATE ON users TO lml_app;

-- Sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO lml_app;

-- View permissions  
GRANT SELECT ON show_summary TO lml_app;
GRANT SELECT ON booking_details TO lml_app;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE shows IS 'Core show information - links to MongoDB for seatmap data';
COMMENT ON COLUMN shows.seatmap_venue_id IS 'References MongoDB venues collection';
COMMENT ON COLUMN shows.seatmap_show_slug IS 'References MongoDB seatmaps collection';

COMMENT ON TABLE bookings IS 'Customer booking records with payment tracking';
COMMENT ON TABLE booking_seats IS 'Individual seat bookings - seat_id references MongoDB seat coordinates';

COMMENT ON VIEW show_summary IS 'Show information with booking statistics';
COMMENT ON VIEW booking_details IS 'Complete booking information with seat details';