//
//  HomeView.swift
//  LML-proj
//
//  Clean home screen for v1 API integration
//  Shows listing with direct APIClient communication
//

import SwiftUI

struct HomeView: View {
    @State private var shows: [Show] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Dark background matching app theme
                Color(red: 0.067, green: 0.094, blue: 0.153) // #111827
                    .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Header with Logo (positioned high)
                    headerSection
                        .padding(.top, -50)
                    
                    // Shows List or Loading/Error State
                    contentSection
                }
            }
            .preferredColorScheme(.dark)
            .onAppear {
                loadShows()
            }
        }
        .navigationBarBackButtonHidden(true) // Disable swipe-back
    }
    
    // MARK: - Data Loading
    private func loadShows() {
        isLoading = true
        errorMessage = nil
        
        Task {
            do {
                let loadedShows = try await APIClient.shared.getShows()
                await MainActor.run {
                    self.shows = loadedShows
                    self.isLoading = false
                }
                print("✅ Loaded \(loadedShows.count) shows from v1 API")
            } catch {
                await MainActor.run {
                    self.errorMessage = "Failed to load shows: \(error.localizedDescription)"
                    self.isLoading = false
                }
                print("❌ Failed to load shows: \(error)")
            }
        }
    }
    
    // MARK: - Header Section
    private var headerSection: some View {
        VStack(spacing: -60) {
            // App Logo Image
            Image("lml-logo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 240)
                .padding(.top, -20)
                .padding(.horizontal, 30)
            
            // Subtitle
            Text("Available Shows")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686)) // #9CA3AF
                .padding(.bottom, 0)
        }
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.122, green: 0.161, blue: 0.216), // #1F2937
                    Color(red: 0.067, green: 0.094, blue: 0.153)  // #111827
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .padding(.horizontal, 20)
        .padding(.bottom, 10)
    }
    
    // MARK: - Content Section
    private var contentSection: some View {
        Group {
            if isLoading {
                loadingView
            } else if let errorMessage = errorMessage {
                errorView(errorMessage)
            } else if shows.isEmpty {
                emptyView
            } else {
                showsListView
            }
        }
    }
    
    // MARK: - Loading View
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
                .tint(.white)
            
            Text("Loading shows...")
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Error View
    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.orange)
            
            Text("Error Loading Shows")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.white)
            
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
            
            Button("Try Again") {
                loadShows()
            }
            .buttonStyle(RetryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Empty View
    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "theatermasks")
                .font(.system(size: 48))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
            
            Text("No Shows Available")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.white)
            
            Text("Check back later for upcoming shows")
                .font(.system(size: 14))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Shows List View
    private var showsListView: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(shows) { show in
                    ShowCard(show: show)
                        .padding(.horizontal, 20)
                }
            }
            .padding(.top, 15)
            .padding(.bottom, 100) // Space for tab bar
        }
    }
}

// MARK: - Show Card Component
struct ShowCard: View {
    let show: Show
    
    var body: some View {
        NavigationLink(destination: SeatMapView(show: show)) {
            VStack(spacing: 0) {
                // Image Section
                ZStack(alignment: .bottomLeading) {
                    // Gradient background (since we don't have images yet)
                    LinearGradient(
                        gradient: Gradient(colors: [
                            Color(red: 0.231, green: 0.510, blue: 0.965), // #3B82F6
                            Color(red: 0.114, green: 0.306, blue: 0.847)  // #1D4ED8
                        ]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .frame(height: 200)
                    .overlay(
                        Text(show.title)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .shadow(color: .black.opacity(0.5), radius: 2, x: 1, y: 1)
                    )
                    
                    // Venue overlay
                    Rectangle()
                        .fill(Color.black.opacity(0.6))
                        .frame(height: 50)
                        .overlay(
                            HStack {
                                Text(show.venue.name)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                        )
                }
                .frame(height: 200)
                .clipped()
                
                // Show Info Section
                VStack(alignment: .leading, spacing: 8) {
                    // Show Title
                    Text(show.title)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                    
                    // Show Date & Time
                    if let firstShowTime = show.schedule.first {
                        Text("\(formatDate(firstShowTime.startTime)) at \(formatTime(firstShowTime.startTime))")
                            .font(.system(size: 14))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                    } else {
                        Text("Schedule TBA")
                            .font(.system(size: 14))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                    }
                    
                    // Price Range
                    HStack(alignment: .bottom, spacing: 0) {
                        Text("From ")
                            .font(.system(size: 16))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                        
                        Text("£\(show.pricing.minPrice)")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(Color(red: 0.063, green: 0.725, blue: 0.506)) // #10B981
                        
                        if show.pricing.maxPrice > show.pricing.minPrice {
                            Text(" - £\(show.pricing.maxPrice)")
                                .font(.system(size: 16, weight: .regular))
                                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
            .background(Color(red: 0.122, green: 0.161, blue: 0.216)) // #1F2937
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(red: 0.216, green: 0.255, blue: 0.318), lineWidth: 1) // #374151
            )
            .shadow(color: Color.black.opacity(0.25), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    // MARK: - Helper Functions
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

// MARK: - Temporary SeatMapView Placeholder
struct SeatMapView: View {
    let show: Show
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Seat Map")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Show: \(show.title)")
                .font(.headline)
            
            Text("Venue: \(show.venue.name)")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            Text("This will be the seat selection screen")
                .font(.body)
                .foregroundColor(.gray)
            
            Spacer()
        }
        .padding()
        .navigationTitle("Select Seats")
        .preferredColorScheme(.dark)
    }
}

// MARK: - Retry Button Style
struct RetryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding(.vertical, 12)
            .padding(.horizontal, 24)
            .background(Color.blue)
            .cornerRadius(8)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Preview
#Preview {
    HomeView()
}