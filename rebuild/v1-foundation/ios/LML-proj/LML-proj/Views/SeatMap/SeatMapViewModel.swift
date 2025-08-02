//
//  SeatMapViewModel.swift
//  LML
//
//  Simplified seat map view model for v1 API integration
//  NO fallback logic - clean, predictable state management
//

import SwiftUI
import Combine

// MARK: - Seat Map View Model
@MainActor
class SeatMapViewModel: ObservableObject {
    
    // MARK: - Published Properties
    @Published var seats: [Seat] = []
    @Published var selectedSeats: [Seat] = []
    @Published var seatMapData: SeatMapData?
    @Published var currentShow: Show?
    
    // UI State
    @Published var isLoading = false
    @Published var isLoadingPayment = false
    @Published var errorMessage: String?
    @Published var showingPaymentSheet = false
    @Published var showingSuccess = false
    
    // Seat Map Interaction
    @Published var scale: CGFloat = 1.0
    @Published var offset: CGSize = .zero
    
    // Payment & Booking
    @Published var paymentIntentResponse: PaymentIntentResponse?
    @Published var bookingReference: String = ""
    
    // MARK: - Dependencies
    private let apiClient: APIClientProtocol
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Computed Properties
    var totalPrice: Int {
        return selectedSeats.reduce(0) { $0 + $1.price }
    }
    
    var canProceedToPayment: Bool {
        return !selectedSeats.isEmpty && !isLoading && !isLoadingPayment
    }
    
    var selectedSeatsSummary: String {
        return selectedSeats.map { $0.displayLabel }.joined(separator: ", ")
    }
    
    var displayTotalPrice: String {
        return "£\(totalPrice)"
    }
    
    // MARK: - Initialization
    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
        setupBindings()
    }
    
    // MARK: - Public Methods
    
    /// Load seatmap for a specific show
    func loadSeatMap(for show: Show) async {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
            currentShow = show
        }
        
        do {
            let seatMapResponse = try await apiClient.getSeatMap(showId: show.id)
            
            await MainActor.run {
                self.seatMapData = seatMapResponse.data
                self.seats = seatMapResponse.data.seats
                self.isLoading = false
            }
            
            print("✅ Loaded seatmap for \(show.title): \(seats.count) seats")
            
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to load seat map: \(error.localizedDescription)"
                self.isLoading = false
            }
            
            print("❌ Failed to load seatmap: \(error)")
        }
    }
    
    /// Toggle seat selection
    func toggleSeat(_ seat: Seat) {
        guard seat.isAvailable && !seat.isReserved else {
            errorMessage = "This seat is not available"
            return
        }
        
        if let index = selectedSeats.firstIndex(where: { $0.id == seat.id }) {
            // Deselect seat
            selectedSeats.remove(at: index)
            updateSeatSelection(seatId: seat.id, isSelected: false)
        } else {
            // Select seat (limit to reasonable number)
            guard selectedSeats.count < 8 else {
                errorMessage = "Maximum 8 seats can be selected"
                return
            }
            
            selectedSeats.append(seat)
            updateSeatSelection(seatId: seat.id, isSelected: true)
        }
        
        // Clear any previous error messages
        errorMessage = nil
    }
    
    /// Create payment intent for selected seats
    func createPaymentIntent(customerEmail: String) async {
        guard !selectedSeats.isEmpty else {
            await MainActor.run {
                errorMessage = "No seats selected"
            }
            return
        }
        
        guard let show = currentShow else {
            await MainActor.run {
                errorMessage = "No show selected"
            }
            return
        }
        
        await MainActor.run {
            isLoadingPayment = true
            errorMessage = nil
        }
        
        do {
            let seatIds = selectedSeats.map { $0.id }
            let response = try await apiClient.createPaymentIntent(
                showId: show.id,
                seatIds: seatIds,
                customerEmail: customerEmail
            )
            
            await MainActor.run {
                self.paymentIntentResponse = response
                self.isLoadingPayment = false
                self.showingPaymentSheet = true
            }
            
            print("✅ Created payment intent: \(response.paymentIntentId)")
            
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to create payment: \(error.localizedDescription)"
                self.isLoadingPayment = false
            }
            
            print("❌ Failed to create payment intent: \(error)")
        }
    }
    
    /// Handle successful payment
    func handlePaymentSuccess(bookingRef: String) {
        bookingReference = bookingRef
        showingPaymentSheet = false
        showingSuccess = true
        
        // Clear selected seats after successful booking
        selectedSeats.removeAll()
        
        print("✅ Payment successful: \(bookingRef)")
    }
    
    /// Handle payment failure
    func handlePaymentFailure(error: String) {
        showingPaymentSheet = false
        errorMessage = "Payment failed: \(error)"
        
        print("❌ Payment failed: \(error)")
    }
    
    /// Reset view model state
    func reset() {
        seats.removeAll()
        selectedSeats.removeAll()
        seatMapData = nil
        currentShow = nil
        errorMessage = nil
        paymentIntentResponse = nil
        bookingReference = ""
        showingPaymentSheet = false
        showingSuccess = false
        scale = 1.0
        offset = .zero
    }
    
    /// Clear error message
    func clearError() {
        errorMessage = nil
    }
    
    // MARK: - Private Methods
    
    private func setupBindings() {
        // Auto-clear error messages after 5 seconds
        $errorMessage
            .compactMap { $0 }
            .delay(for: .seconds(5), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.errorMessage = nil
            }
            .store(in: &cancellables)
    }
    
    private func updateSeatSelection(seatId: String, isSelected: Bool) {
        if let index = seats.firstIndex(where: { $0.id == seatId }) {
            seats[index].isSelected = isSelected
        }
    }
}

// MARK: - Preview Support
extension SeatMapViewModel {
    static func preview() -> SeatMapViewModel {
        let viewModel = SeatMapViewModel(apiClient: MockAPIClient())
        return viewModel
    }
}

// MARK: - Mock API Client for Previews
private class MockAPIClient: APIClientProtocol {
    func getShows() async throws -> [Show] {
        // Return mock shows for preview
        return []
    }
    
    func getSeatMap(showId: String) async throws -> SeatMapResponse {
        // Return mock seatmap for preview
        let mockSeats = (1...10).map { i in
            Seat(
                id: "seat-\(i)",
                sectionId: "premium",
                row: "A",
                number: "\(i)",
                x: Double(i * 50),
                y: 100,
                width: 40,
                height: 40,
                price: 85,
                isAvailable: true,
                isReserved: false,
                seatType: .premium
            )
        }
        
        return SeatMapResponse(
            success: true,
            data: SeatMapData(
                showId: showId,
                venueId: "mock-venue",
                layout: SeatLayout(
                    width: 800,
                    height: 600,
                    viewBox: ViewBox(x: 0, y: 0, width: 800, height: 600),
                    scale: 1.0
                ),
                sections: [],
                seats: mockSeats
            ),
            metadata: SeatMapMetadata(
                version: "1.0",
                lastUpdated: Date(),
                totalSeats: 10,
                availableSeats: 10,
                source: "mock"
            )
        )
    }
    
    func createPaymentIntent(showId: String, seatIds: [String], customerEmail: String) async throws -> PaymentIntentResponse {
        return PaymentIntentResponse(
            success: true,
            clientSecret: "mock_secret",
            paymentIntentId: "mock_intent",
            amount: 8500,
            currency: "gbp",
            metadata: PaymentMetadata(
                showId: showId,
                seatIds: seatIds,
                customerEmail: customerEmail,
                bookingReference: "MOCK123"
            )
        )
    }
    
    func getUserTickets(email: String) async throws -> [Ticket] {
        return []
    }
    
    func healthCheck() async throws -> HealthResponse {
        return HealthResponse(
            success: true,
            data: HealthData(
                status: "healthy",
                uptime: 123,
                services: HealthServices(
                    postgres: ServiceHealth(status: "connected", responseTime: 10),
                    mongodb: ServiceHealth(status: "connected", responseTime: 15),
                    redis: ServiceHealth(status: "connected", responseTime: 5)
                )
            )
        )
    }
}