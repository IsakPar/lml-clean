//
//  Show.swift
//  LML
//
//  Clean show model for v1 API integration
//  No fallback logic, works only with /api/v1/shows endpoint
//

import Foundation

// MARK: - Show Model
struct Show: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let venue: Venue
    let description: String
    let imageURL: String?
    let category: ShowCategory
    let duration: TimeInterval
    let ageRating: String
    let pricing: PricingInfo
    let schedule: [ShowTime]
    let isActive: Bool
    let createdAt: Date
    let updatedAt: Date
    
    // MARK: - Display Properties
    var displayTitle: String {
        return title
    }
    
    var shortDescription: String {
        return String(description.prefix(100)) + (description.count > 100 ? "..." : "")
    }
}

// MARK: - Venue Model
struct Venue: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let address: Address
    let capacity: Int
    let accessibility: AccessibilityInfo
    let facilities: [String]
}

// MARK: - Address Model
struct Address: Codable, Equatable {
    let street: String
    let city: String
    let postcode: String
    let country: String
    
    var fullAddress: String {
        return "\(street), \(city), \(postcode), \(country)"
    }
}

// MARK: - Accessibility Info
struct AccessibilityInfo: Codable, Equatable {
    let wheelchairAccessible: Bool
    let hearingLoopAvailable: Bool
    let audioDescriptionAvailable: Bool
    let signLanguageAvailable: Bool
}

// MARK: - Show Category
enum ShowCategory: String, Codable, CaseIterable {
    case musical = "musical"
    case play = "play"
    case comedy = "comedy"
    case drama = "drama"
    case opera = "opera"
    case ballet = "ballet"
    case dance = "dance"
    case concert = "concert"
    case family = "family"
    case cabaret = "cabaret"
    case other = "other"
    
    var displayName: String {
        switch self {
        case .musical: return "Musical"
        case .play: return "Play"
        case .comedy: return "Comedy"
        case .drama: return "Drama"
        case .opera: return "Opera"
        case .ballet: return "Ballet"
        case .dance: return "Dance"
        case .concert: return "Concert"
        case .family: return "Family"
        case .cabaret: return "Cabaret"
        case .other: return "Other"
        }
    }
}

// MARK: - Show Time
struct ShowTime: Codable, Identifiable, Equatable {
    let id: String
    let showId: String
    let startTime: Date
    let endTime: Date
    let isAvailable: Bool
    let availableSeats: Int
    
    var displayDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: startTime)
    }
    
    var displayTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: startTime)
    }
}

// MARK: - Pricing Info
struct PricingInfo: Codable, Equatable {
    let currency: String
    let sections: [PricingSection]
    
    var minPrice: Int {
        return sections.map { $0.price }.min() ?? 0
    }
    
    var maxPrice: Int {
        return sections.map { $0.price }.max() ?? 0
    }
}

// MARK: - Pricing Section
struct PricingSection: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let price: Int
    let availableSeats: Int
    let totalSeats: Int
    
    var isAvailable: Bool {
        return availableSeats > 0
    }
    
    var displayPrice: String {
        return "£\(price)"
    }
}