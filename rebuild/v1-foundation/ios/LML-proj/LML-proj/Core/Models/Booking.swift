//
//  Booking.swift
//  LML
//
//  Clean booking models for v1 API integration
//  Handles tickets, payments, and booking data
//

import Foundation

// MARK: - Booking Model
struct Booking: Codable, Identifiable, Equatable {
    let id: String
    let showId: String
    let userId: String?
    let customerEmail: String
    let customerName: String
    let showTime: ShowTime
    let seats: [BookedSeat]
    let totalAmount: Int
    let currency: String
    let status: BookingStatus
    let paymentMethod: String
    let bookingReference: String
    let createdAt: Date
    let updatedAt: Date
    
    // MARK: - Display Properties
    var displayReference: String {
        return bookingReference.uppercased()
    }
    
    var displayTotal: String {
        return "£\(totalAmount)"
    }
    
    var seatCount: Int {
        return seats.count
    }
    
    var seatSummary: String {
        return seats.map { $0.displayLabel }.joined(separator: ", ")
    }
}

// MARK: - Booked Seat
struct BookedSeat: Codable, Identifiable, Equatable {
    let id: String
    let seatId: String
    let section: String
    let row: String
    let number: String
    let price: Int
    
    var displayLabel: String {
        return "\(row)\(number)"
    }
    
    var fullDisplayLabel: String {
        return "\(section) Row \(row), Seat \(number)"
    }
    
    var displayPrice: String {
        return "£\(price)"
    }
}

// MARK: - Booking Status
enum BookingStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case confirmed = "confirmed"
    case cancelled = "cancelled"
    case refunded = "refunded"
    case expired = "expired"
    
    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .confirmed: return "Confirmed"
        case .cancelled: return "Cancelled"
        case .refunded: return "Refunded"
        case .expired: return "Expired"
        }
    }
    
    var color: String {
        switch self {
        case .pending: return "orange"
        case .confirmed: return "green"
        case .cancelled: return "red"
        case .refunded: return "blue"
        case .expired: return "gray"
        }
    }
}

// MARK: - Ticket Model
struct Ticket: Codable, Identifiable, Equatable {
    let id: String
    let bookingId: String
    let seatId: String
    let qrCode: String
    let validationCode: String
    let isUsed: Bool
    let usedAt: Date?
    let createdAt: Date
    
    // Associated booking data for display
    let booking: Booking
    
    // MARK: - Display Properties
    var displayCode: String {
        return validationCode.uppercased()
    }
    
    var isValid: Bool {
        return !isUsed && booking.status == .confirmed
    }
    
    var statusText: String {
        if isUsed {
            return "Used"
        } else if booking.status != .confirmed {
            return booking.status.displayName
        } else {
            return "Valid"
        }
    }
}

// MARK: - Payment Intent Response
struct PaymentIntentResponse: Codable {
    let success: Bool
    let clientSecret: String
    let paymentIntentId: String
    let amount: Int
    let currency: String
    let metadata: PaymentMetadata
}

// MARK: - Payment Metadata
struct PaymentMetadata: Codable {
    let showId: String
    let seatIds: [String]
    let customerEmail: String
    let bookingReference: String
}

// MARK: - Guest Session
struct GuestSession: Codable {
    let sessionId: String
    let email: String
    let deviceInfo: [String: String]
    let expiresAt: Date
    let createdAt: Date
    
    var isExpired: Bool {
        return Date() > expiresAt
    }
}

// MARK: - API Response Models
struct BookingResponse: Codable {
    let success: Bool
    let data: Booking?
    let error: String?
}

struct TicketsResponse: Codable {
    let success: Bool
    let data: [Ticket]?
    let error: String?
}