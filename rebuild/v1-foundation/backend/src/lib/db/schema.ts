/**
 * LML v1 Foundation - Drizzle ORM Schema
 * =====================================
 * PostgreSQL schema definitions using Drizzle ORM
 * Based on: rebuild/v1-foundation/database/postgres/schema.sql
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  time,
  timestamp,
  index,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

// ================================================
// SHOWS TABLE
// ================================================

export const shows = pgTable(
  'shows',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    venueName: varchar('venue_name', { length: 200 }).notNull(),
    venueAddress: text('venue_address'),
    showDate: date('show_date').notNull(),
    showTime: time('show_time').notNull(),
    durationMinutes: integer('duration_minutes').default(150),
    
    // Pricing (in pence for precision)
    basePricePence: integer('base_price_pence').notNull(),
    maxPricePence: integer('max_price_pence').notNull(),
    
    // Capacity & Availability
    totalCapacity: integer('total_capacity'),
    availableSeats: integer('available_seats'),
    
    // MongoDB References (clean separation)
    seatmapVenueId: varchar('seatmap_venue_id', { length: 100 }),
    seatmapShowSlug: varchar('seatmap_show_slug', { length: 100 }),
    
    // Status & Metadata
    status: varchar('status', { length: 20 }).default('active'),
    category: varchar('category', { length: 50 }).default('musical'),
    ageRating: varchar('age_rating', { length: 10 }).default('PG'),
    language: varchar('language', { length: 10 }).default('EN'),
    
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Indexes
    slugIdx: index('idx_shows_slug').on(table.slug),
    dateIdx: index('idx_shows_date').on(table.showDate),
    statusIdx: index('idx_shows_status').on(table.status),
    venueIdx: index('idx_shows_venue').on(table.venueName),
    seatmapRefsIdx: index('idx_shows_seatmap_refs').on(table.seatmapVenueId, table.seatmapShowSlug),
    
    // Constraints
    validStatus: check('valid_status', sql`status IN ('active', 'sold_out', 'cancelled', 'draft')`),
    validCapacity: check('valid_capacity', sql`total_capacity >= 0 AND available_seats >= 0`),
    validPricing: check('valid_pricing', sql`base_price_pence > 0 AND max_price_pence >= base_price_pence`),
  })
);

// ================================================
// BOOKINGS TABLE
// ================================================

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    showId: integer('show_id').notNull().references(() => shows.id, { onDelete: 'restrict' }),
    
    // Customer Information
    customerEmail: varchar('customer_email', { length: 255 }).notNull(),
    customerFirstName: varchar('customer_first_name', { length: 100 }),
    customerLastName: varchar('customer_last_name', { length: 100 }),
    customerPhone: varchar('customer_phone', { length: 20 }),
    
    // Booking Details
    bookingReference: varchar('booking_reference', { length: 20 }).notNull().unique(),
    totalAmountPence: integer('total_amount_pence').notNull(),
    seatCount: integer('seat_count').notNull(),
    
    // Payment Status
    paymentStatus: varchar('payment_status', { length: 20 }).default('pending'),
    paymentIntentId: varchar('payment_intent_id', { length: 100 }),
    paymentMethod: varchar('payment_method', { length: 50 }),
    
    // Booking Status
    bookingStatus: varchar('booking_status', { length: 20 }).default('confirmed'),
    validationCode: varchar('validation_code', { length: 6 }),
    
    // Timestamps
    bookingDate: timestamp('booking_date', { withTimezone: true }).defaultNow(),
    paymentDate: timestamp('payment_date', { withTimezone: true }),
    cancelledDate: timestamp('cancelled_date', { withTimezone: true }),
    checkedInDate: timestamp('checked_in_date', { withTimezone: true }),
  },
  (table) => ({
    // Indexes
    showIdIdx: index('idx_bookings_show_id').on(table.showId),
    emailIdx: index('idx_bookings_email').on(table.customerEmail),
    referenceIdx: index('idx_bookings_reference').on(table.bookingReference),
    paymentStatusIdx: index('idx_bookings_payment_status').on(table.paymentStatus),
    dateIdx: index('idx_bookings_date').on(table.bookingDate),
    validationCodeIdx: index('idx_bookings_validation_code').on(table.validationCode),
    
    // Constraints
    validPaymentStatus: check('valid_payment_status', sql`payment_status IN ('pending', 'paid', 'failed', 'refunded')`),
    validBookingStatus: check('valid_booking_status', sql`booking_status IN ('confirmed', 'cancelled', 'checked_in')`),
    validSeatCount: check('valid_seat_count', sql`seat_count > 0`),
    validAmount: check('valid_amount', sql`total_amount_pence > 0`),
  })
);

// ================================================
// BOOKING_SEATS TABLE
// ================================================

export const bookingSeats = pgTable(
  'booking_seats',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
    
    // Seat Reference (MongoDB seat ID)
    seatId: varchar('seat_id', { length: 100 }).notNull(),
    seatSection: varchar('seat_section', { length: 50 }).notNull(),
    seatRow: varchar('seat_row', { length: 10 }).notNull(),
    seatNumber: integer('seat_number').notNull(),
    
    // Pricing
    pricePaidPence: integer('price_paid_pence').notNull(),
    
    // Status
    seatStatus: varchar('seat_status', { length: 20 }).default('booked'),
    
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Indexes
    bookingIdIdx: index('idx_booking_seats_booking_id').on(table.bookingId),
    seatIdIdx: index('idx_booking_seats_seat_id').on(table.seatId),
    sectionIdx: index('idx_booking_seats_section').on(table.seatSection),
    
    // Constraints
    validSeatStatus: check('valid_seat_status', sql`seat_status IN ('booked', 'checked_in', 'no_show')`),
    validSeatPrice: check('valid_seat_price', sql`price_paid_pence > 0`),
    validSeatNumber: check('valid_seat_number', sql`seat_number > 0`),
    
    // Unique constraint
    uniqueBookingSeat: unique('unique_booking_seat').on(table.bookingId, table.seatId),
  })
);

// ================================================
// USERS TABLE
// ================================================

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    phone: varchar('phone', { length: 20 }),
    
    // Authentication
    passwordHash: varchar('password_hash', { length: 255 }),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    isActive: integer('is_active').default(1), // 1 = active, 0 = inactive
    
    // Preferences
    preferredLanguage: varchar('preferred_language', { length: 10 }).default('EN'),
    marketingOptIn: integer('marketing_opt_in').default(0), // 1 = opted in, 0 = opted out
    
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => ({
    // Indexes
    emailIdx: index('idx_users_email').on(table.email),
    activeIdx: index('idx_users_active').on(table.isActive),
    createdIdx: index('idx_users_created').on(table.createdAt),
    
    // Constraints
    validActive: check('valid_active', sql`is_active IN (0, 1)`),
    validMarketingOptIn: check('valid_marketing_opt_in', sql`marketing_opt_in IN (0, 1)`),
  })
);

// ================================================
// RELATIONS
// ================================================

export const showsRelations = relations(shows, ({ many }) => ({
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  show: one(shows, {
    fields: [bookings.showId],
    references: [shows.id],
  }),
  bookingSeats: many(bookingSeats),
}));

export const bookingSeatsRelations = relations(bookingSeats, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingSeats.bookingId],
    references: [bookings.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings, {
    relationName: 'userBookings',
  }),
}));

// ================================================
// TYPE EXPORTS
// ================================================

export type Show = typeof shows.$inferSelect;
export type NewShow = typeof shows.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type BookingSeat = typeof bookingSeats.$inferSelect;
export type NewBookingSeat = typeof bookingSeats.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;