//
//  APIClientTests.swift
//  LMLTests
//
//  Unit tests for clean v1 API client integration
//  Tests the new simplified API client without fallback logic
//

import XCTest
@testable import LML

final class APIClientTests: XCTestCase {
    
    private var apiClient: APIClient!
    
    override func setUp() {
        super.setUp()
        // Use development environment for tests
        apiClient = APIClient.shared
    }
    
    override func tearDown() {
        apiClient = nil
        super.tearDown()
    }
    
    // MARK: - Health Check Tests
    
    func testHealthCheck() async throws {
        // Test that health check endpoint works
        let healthResponse = try await apiClient.healthCheck()
        
        XCTAssertTrue(healthResponse.success)
        XCTAssertEqual(healthResponse.data.status, "healthy")
        XCTAssertGreaterThan(healthResponse.data.uptime, 0)
        
        // Test database connections
        XCTAssertEqual(healthResponse.data.services.postgres.status, "connected")
        XCTAssertEqual(healthResponse.data.services.mongodb.status, "connected")
        XCTAssertEqual(healthResponse.data.services.redis.status, "connected")
    }
    
    // MARK: - Shows API Tests
    
    func testGetShows() async throws {
        // Test that shows endpoint returns data
        let shows = try await apiClient.getShows()
        
        XCTAssertGreaterThan(shows.count, 0, "Should return at least one show")
        
        // Test show structure
        let firstShow = shows.first!
        XCTAssertFalse(firstShow.id.isEmpty, "Show ID should not be empty")
        XCTAssertFalse(firstShow.title.isEmpty, "Show title should not be empty")
        XCTAssertTrue(firstShow.isActive, "Show should be active")
        XCTAssertGreaterThan(firstShow.pricing.sections.count, 0, "Show should have pricing sections")
    }
    
    // MARK: - SeatMap API Tests
    
    func testGetSeatMap() async throws {
        // First get a show
        let shows = try await apiClient.getShows()
        guard let firstShow = shows.first else {
            XCTFail("No shows available for testing")
            return
        }
        
        // Test seatmap endpoint
        let seatMapResponse = try await apiClient.getSeatMap(showId: firstShow.id)
        
        XCTAssertTrue(seatMapResponse.success)
        XCTAssertEqual(seatMapResponse.data.showId, firstShow.id)
        XCTAssertGreaterThan(seatMapResponse.data.seats.count, 0, "Should return seats")
        XCTAssertGreaterThan(seatMapResponse.metadata.totalSeats, 0, "Should have total seats count")
    }
    
    // MARK: - Error Handling Tests
    
    func testInvalidShowId() async {
        // Test error handling with invalid show ID
        do {
            _ = try await apiClient.getSeatMap(showId: "invalid-show-id")
            XCTFail("Should throw error for invalid show ID")
        } catch {
            // Expected to throw error
            XCTAssertTrue(error is APIError)
        }
    }
    
    // MARK: - Environment Tests
    
    func testEnvironmentConfiguration() {
        let config = EnvironmentConfig.shared
        
        // Test configuration validation
        XCTAssertTrue(config.validateConfiguration())
        
        // Test environment properties
        XCTAssertFalse(config.appVersion.isEmpty)
        XCTAssertFalse(config.bundleIdentifier.isEmpty)
        XCTAssertFalse(config.userAgent.isEmpty)
        
        // Test API environment
        let apiEnv = config.apiEnvironment
        XCTAssertNotNil(apiEnv.baseURL.scheme)
        XCTAssertNotNil(apiEnv.baseURL.host)
    }
}

// MARK: - SeatMapViewModel Tests
final class SeatMapViewModelTests: XCTestCase {
    
    @MainActor
    func testSeatMapViewModelInitialization() {
        let viewModel = SeatMapViewModel.preview()
        
        XCTAssertTrue(viewModel.seats.isEmpty)
        XCTAssertTrue(viewModel.selectedSeats.isEmpty)
        XCTAssertEqual(viewModel.totalPrice, 0)
        XCTAssertFalse(viewModel.canProceedToPayment)
    }
    
    @MainActor
    func testSeatSelection() async {
        let viewModel = SeatMapViewModel.preview()
        
        // Create mock seat
        let mockSeat = Seat(
            id: "test-seat-1",
            sectionId: "premium",
            row: "A",
            number: "1",
            x: 100,
            y: 100,
            width: 40,
            height: 40,
            price: 85,
            isAvailable: true,
            isReserved: false,
            seatType: .premium
        )
        
        // Add seat to viewmodel
        viewModel.seats = [mockSeat]
        
        // Test seat selection
        viewModel.toggleSeat(mockSeat)
        
        XCTAssertEqual(viewModel.selectedSeats.count, 1)
        XCTAssertEqual(viewModel.totalPrice, 85)
        XCTAssertTrue(viewModel.canProceedToPayment)
        
        // Test seat deselection
        viewModel.toggleSeat(mockSeat)
        
        XCTAssertEqual(viewModel.selectedSeats.count, 0)
        XCTAssertEqual(viewModel.totalPrice, 0)
        XCTAssertFalse(viewModel.canProceedToPayment)
    }
}