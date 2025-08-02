//
//  SeatMap.swift
//  LML
//
//  Clean seatmap models for v1 API integration
//  Works with hybrid MongoDB + PostgreSQL seatmap data
//

import Foundation

// MARK: - Seatmap Response
struct SeatMapResponse: Codable {
    let success: Bool
    let data: SeatMapData
    let metadata: SeatMapMetadata
}

// MARK: - Seatmap Data
struct SeatMapData: Codable, Equatable {
    let showId: String
    let venueId: String
    let layout: SeatLayout
    let sections: [SeatSection]
    let seats: [Seat]
}

// MARK: - Seat Layout
struct SeatLayout: Codable, Equatable {
    let width: Double
    let height: Double
    let viewBox: ViewBox
    let scale: Double
}

// MARK: - View Box
struct ViewBox: Codable, Equatable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

// MARK: - Seat Section
struct SeatSection: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let displayName: String
    let color: String
    let basePrice: Int
    let position: SectionPosition
    let maxSeats: Int
    let availableSeats: Int
}

// MARK: - Section Position
struct SectionPosition: Codable, Equatable {
    let x: Double
    let y: Double
    let rotation: Double
}

// MARK: - Seat Model
struct Seat: Codable, Identifiable, Equatable {
    let id: String
    let sectionId: String
    let row: String
    let number: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let price: Int
    let isAvailable: Bool
    let isReserved: Bool
    let seatType: SeatType
    var isSelected: Bool = false
    
    // MARK: - Display Properties
    var displayLabel: String {
        return "\(row)\(number)"
    }
    
    var fullDisplayLabel: String {
        return "Row \(row), Seat \(number)"
    }
    
    var displayPrice: String {
        return "£\(price)"
    }
}

// MARK: - Seat Type
enum SeatType: String, Codable, Equatable, CaseIterable {
    case standard = "standard"
    case premium = "premium"
    case wheelchair = "wheelchair"
    case companion = "companion"
    case restricted = "restricted"
    
    var displayName: String {
        switch self {
        case .standard: return "Standard"
        case .premium: return "Premium"
        case .wheelchair: return "Wheelchair Accessible"
        case .companion: return "Companion"
        case .restricted: return "Restricted View"
        }
    }
    
    var iconName: String {
        switch self {
        case .standard: return "chair"
        case .premium: return "chair.fill"
        case .wheelchair: return "figure.roll"
        case .companion: return "person.2"
        case .restricted: return "eye.slash"
        }
    }
}

// MARK: - Seatmap Metadata
struct SeatMapMetadata: Codable, Equatable {
    let version: String
    let lastUpdated: Date
    let totalSeats: Int
    let availableSeats: Int
    let source: String // "hybrid", "mongodb", "postgres"
    
    var availabilityPercentage: Double {
        guard totalSeats > 0 else { return 0 }
        return Double(availableSeats) / Double(totalSeats) * 100
    }
}