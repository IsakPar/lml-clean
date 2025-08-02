//
//  APIClient.swift
//  LML
//
//  Clean API client for v1 endpoints only
//  NO fallback logic - direct communication with rebuild backend
//

import Foundation

// MARK: - API Client Protocol
protocol APIClientProtocol {
    func getShows() async throws -> [Show]
    func getSeatMap(showId: String) async throws -> SeatMapResponse
    func createPaymentIntent(showId: String, seatIds: [String], customerEmail: String) async throws -> PaymentIntentResponse
    func getUserTickets(email: String) async throws -> [Ticket]
    func healthCheck() async throws -> HealthResponse
}

// MARK: - API Environment
enum APIEnvironment {
    case development
    case production
    
    var baseURL: URL {
        switch self {
        case .development:
            return URL(string: "http://localhost:3001")!
        case .production:
            return URL(string: "https://then-production.up.railway.app")!
        }
    }
}

// MARK: - API Client
class APIClient: APIClientProtocol {
    static let shared = APIClient()
    
    private let session: URLSession
    private let baseURL: URL
    private let environment: APIEnvironment
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder
    
    private init(environment: APIEnvironment = .production) {
        self.environment = environment
        self.baseURL = environment.baseURL
        
        // Configure URL session
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
        
        // Configure JSON handling
        self.jsonDecoder = JSONDecoder()
        self.jsonDecoder.dateDecodingStrategy = .iso8601
        
        self.jsonEncoder = JSONEncoder()
        self.jsonEncoder.dateEncodingStrategy = .iso8601
        
        print("🌐 APIClient initialized with environment: \(environment)")
        print("📍 Base URL: \(baseURL.absoluteString)")
    }
    
    // MARK: - Public API Methods
    
    /// Get all available shows
    func getShows() async throws -> [Show] {
        let url = baseURL.appendingPathComponent("/api/v1/shows")
        let response: APIResponse<ShowsData> = try await performRequest(url: url)
        
        guard response.success, let data = response.data else {
            throw APIError.invalidResponse("Failed to get shows: \(response.error ?? "Unknown error")")
        }
        
        return data.shows
    }
    
    /// Get seatmap for a specific show
    func getSeatMap(showId: String) async throws -> SeatMapResponse {
        let url = baseURL.appendingPathComponent("/api/v1/shows/\(showId)/seatmap")
        let response: SeatMapResponse = try await performRequest(url: url)
        
        guard response.success else {
            throw APIError.invalidResponse("Failed to get seatmap")
        }
        
        return response
    }
    
    /// Create payment intent for booking
    func createPaymentIntent(showId: String, seatIds: [String], customerEmail: String) async throws -> PaymentIntentResponse {
        let url = baseURL.appendingPathComponent("/api/v1/payment/intent")
        
        let requestBody = PaymentIntentRequest(
            showId: showId,
            seatIds: seatIds,
            customerEmail: customerEmail
        )
        
        let response: PaymentIntentResponse = try await performRequest(
            url: url,
            method: "POST",
            body: requestBody
        )
        
        guard response.success else {
            throw APIError.paymentFailed("Failed to create payment intent")
        }
        
        return response
    }
    
    /// Get user tickets by email
    func getUserTickets(email: String) async throws -> [Ticket] {
        let url = baseURL.appendingPathComponent("/api/v1/user/tickets")
            .appending(queryItems: [URLQueryItem(name: "email", value: email)])
        
        let response: APIResponse<TicketsData> = try await performRequest(url: url)
        
        guard response.success, let data = response.data else {
            throw APIError.invalidResponse("Failed to get tickets: \(response.error ?? "Unknown error")")
        }
        
        return data.tickets
    }
    
    /// Health check endpoint
    func healthCheck() async throws -> HealthResponse {
        let url = baseURL.appendingPathComponent("/api/v1/health")
        let response: HealthResponse = try await performRequest(url: url)
        return response
    }
    
    // MARK: - Private Helper Methods
    
    private func performRequest<T: Codable>(
        url: URL,
        method: String = "GET",
        body: (any Codable)? = nil
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("LML-iOS/1.0", forHTTPHeaderField: "User-Agent")
        
        // Add request body if provided
        if let body = body {
            request.httpBody = try jsonEncoder.encode(body)
        }
        
        print("🌐 API Request: \(method) \(url.absoluteString)")
        
        do {
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse("Invalid HTTP response")
            }
            
            print("📡 API Response: \(httpResponse.statusCode)")
            
            // Check for HTTP errors
            guard 200...299 ~= httpResponse.statusCode else {
                let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw APIError.httpError(httpResponse.statusCode, errorMessage)
            }
            
            // Decode response
            let decodedResponse = try jsonDecoder.decode(T.self, from: data)
            return decodedResponse
            
        } catch {
            print("❌ API Error: \(error)")
            throw APIError.networkError(error)
        }
    }
}

// MARK: - API Error Types
enum APIError: Error, LocalizedError {
    case networkError(Error)
    case invalidResponse(String)
    case httpError(Int, String)
    case paymentFailed(String)
    case invalidURL
    case decodingError(Error)
    
    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidResponse(let message):
            return "Invalid response: \(message)"
        case .httpError(let code, let message):
            return "HTTP \(code): \(message)"
        case .paymentFailed(let message):
            return "Payment failed: \(message)"
        case .invalidURL:
            return "Invalid URL"
        case .decodingError(let error):
            return "Data parsing error: \(error.localizedDescription)"
        }
    }
}

// MARK: - Request/Response Models
private struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let error: String?
}

private struct ShowsData: Codable {
    let shows: [Show]
    let total: Int
    let page: Int
    let limit: Int
}

private struct TicketsData: Codable {
    let tickets: [Ticket]
}

private struct PaymentIntentRequest: Codable {
    let showId: String
    let seatIds: [String]
    let customerEmail: String
}

struct HealthResponse: Codable {
    let success: Bool
    let data: HealthData
}

struct HealthData: Codable {
    let status: String
    let uptime: Int
    let services: HealthServices
}

struct HealthServices: Codable {
    let postgres: ServiceHealth
    let mongodb: ServiceHealth
    let redis: ServiceHealth
}

struct ServiceHealth: Codable {
    let status: String
    let responseTime: Int
}