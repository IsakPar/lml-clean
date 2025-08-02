//
//  TicketsView.swift
//  LML-proj
//
//  Clean tickets view for v1 API integration
//  Simple ticket management without complex auth dependencies
//

import SwiftUI

struct TicketsView: View {
    @State private var isSignedIn = false
    @State private var tickets: [TicketItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedTicket: TicketItem?
    @State private var showingSignIn = false
    @State private var showingSignUp = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Dark background matching app theme
                Color(red: 0.067, green: 0.094, blue: 0.153) // #111827
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        if isLoading {
                            loadingContent
                        } else if isSignedIn {
                            authenticatedContent
                        } else {
                            notAuthenticatedContent
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 100) // Space for tab bar
                }
            }
            .navigationTitle("Your Tickets")
            .navigationBarTitleDisplayMode(.large)
            .preferredColorScheme(.dark)
        }
        .navigationBarBackButtonHidden(true) // Disable swipe-back
        .onAppear {
            loadTicketsIfSignedIn()
        }
        .sheet(isPresented: $showingSignIn) {
            SignInModalView(isPresented: $showingSignIn, onSuccess: handleSignInSuccess)
        }
        .sheet(isPresented: $showingSignUp) {
            SignUpModalView(isPresented: $showingSignUp, onSuccess: handleSignUpSuccess)
        }
        .sheet(item: $selectedTicket) { ticket in
            TicketDetailModalView(ticket: ticket)
        }
        .refreshable {
            await refreshTickets()
        }
    }
    
    // MARK: - Content Views
    
    private var loadingContent: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
                .tint(.white)
            
            Text("Loading your tickets...")
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
        }
        .frame(maxHeight: .infinity)
        .padding(.top, 100)
    }
    
    private var notAuthenticatedContent: some View {
        VStack(spacing: 32) {
            // Welcome Header
            VStack(spacing: 16) {
                Image(systemName: "ticket.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.blue)
                    .padding(.top, 40)
                
                Text("Your Tickets")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                
                Text("Sign in to view your booked tickets and get easy access to all your shows")
                    .font(.body)
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            // Authentication Options
            VStack(spacing: 16) {
                // Sign In Button
                Button(action: { showingSignIn = true }) {
                    HStack {
                        Image(systemName: "person.circle")
                        Text("Sign In")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .font(.system(size: 16, weight: .semibold))
                }
                
                // Sign Up Button
                Button(action: { showingSignUp = true }) {
                    HStack {
                        Image(systemName: "person.badge.plus")
                        Text("Create Account")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(red: 0.122, green: 0.161, blue: 0.216))
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .font(.system(size: 16, weight: .semibold))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue, lineWidth: 1)
                    )
                }
                
                // Browse Shows Button
                Button(action: switchToHomeTab) {
                    Text("Browse Shows Instead")
                        .font(.system(size: 14))
                        .foregroundColor(.blue)
                        .underline()
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 16)
            
            if let errorMessage = errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }
        }
    }
    
    private var authenticatedContent: some View {
        VStack(spacing: 24) {
            // User Stats Header
            VStack(spacing: 16) {
                HStack {
                    Text("Your Tickets")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    Text("\(tickets.count) tickets")
                        .font(.subheadline)
                        .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                }
                
                // Quick Stats
                HStack(spacing: 12) {
                    TicketStatCard(
                        title: "Upcoming",
                        count: tickets.filter { $0.status == .upcoming }.count,
                        color: .blue
                    )
                    
                    TicketStatCard(
                        title: "Past",
                        count: tickets.filter { $0.status == .used }.count,
                        color: .gray
                    )
                    
                    TicketStatCard(
                        title: "Cancelled",
                        count: tickets.filter { $0.status == .cancelled }.count,
                        color: .red
                    )
                }
            }
            
            // Tickets List
            if tickets.isEmpty {
                emptyTicketsState
            } else {
                ticketsListSection
            }
        }
    }
    
    private var emptyTicketsState: some View {
        VStack(spacing: 20) {
            Image(systemName: "ticket")
                .font(.system(size: 64))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
            
            Text("No Tickets Yet")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.white)
            
            Text("When you book shows, your tickets will appear here")
                .font(.body)
                .foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            
            Button(action: switchToHomeTab) {
                Text("Browse Shows")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .font(.system(size: 16, weight: .semibold))
            }
            .padding(.horizontal, 40)
        }
        .padding(.top, 40)
    }
    
    private var ticketsListSection: some View {
        LazyVStack(spacing: 12) {
            ForEach(tickets) { ticket in
                TicketCard(ticket: ticket) {
                    selectedTicket = ticket
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func loadTicketsIfSignedIn() {
        if isSignedIn {
            loadTickets()
        }
    }
    
    private func loadTickets() {
        isLoading = true
        errorMessage = nil
        
        // Simulate loading tickets from v1 API
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isLoading = false
            
            // Mock ticket data
            tickets = [
                TicketItem(
                    id: "1",
                    showTitle: "Hamilton",
                    venueName: "Victoria Palace Theatre",
                    date: Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date(),
                    time: "19:30",
                    seats: "Row A, Seats 12-13",
                    price: "£170.00",
                    status: .upcoming,
                    qrCode: "HAMILTON123"
                ),
                TicketItem(
                    id: "2",
                    showTitle: "The Phantom of the Opera",
                    venueName: "Her Majesty's Theatre",
                    date: Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date(),
                    time: "19:30",
                    seats: "Row C, Seat 8",
                    price: "£85.00",
                    status: .used,
                    qrCode: "PHANTOM456"
                )
            ]
        }
    }
    
    private func refreshTickets() async {
        guard isSignedIn else { return }
        
        await MainActor.run {
            loadTickets()
        }
    }
    
    private func handleSignInSuccess(email: String, name: String) {
        isSignedIn = true
        showingSignIn = false
        loadTickets()
    }
    
    private func handleSignUpSuccess(email: String, name: String) {
        isSignedIn = true
        showingSignUp = false
        loadTickets()
    }
    
    private func switchToHomeTab() {
        // This would typically involve a TabView binding to tab index 1 (Home is now center tab)
        // For now, just print the action
        print("Switch to Home tab (index 1)")
    }
}

// MARK: - Ticket Models
struct TicketItem: Identifiable {
    let id: String
    let showTitle: String
    let venueName: String
    let date: Date
    let time: String
    let seats: String
    let price: String
    let status: TicketStatus
    let qrCode: String
    
    var displayDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
    
    var isUpcoming: Bool {
        return date > Date() && status == .upcoming
    }
}

enum TicketStatus {
    case upcoming
    case used
    case cancelled
    
    var displayName: String {
        switch self {
        case .upcoming: return "Upcoming"
        case .used: return "Used"
        case .cancelled: return "Cancelled"
        }
    }
    
    var color: Color {
        switch self {
        case .upcoming: return .blue
        case .used: return .gray
        case .cancelled: return .red
        }
    }
}

// MARK: - Ticket Stat Card Component
struct TicketStatCard: View {
    let title: String
    let count: Int
    let color: Color
    
    var body: some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(color)
            
            Text(title)
                .font(.caption)
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(red: 0.122, green: 0.161, blue: 0.216))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(red: 0.216, green: 0.255, blue: 0.318), lineWidth: 1)
        )
    }
}

// MARK: - Ticket Card Component
struct TicketCard: View {
    let ticket: TicketItem
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 12) {
                // Header with status
                HStack {
                    Text(ticket.showTitle)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    Spacer()
                    
                    Text(ticket.status.displayName)
                        .font(.caption)
                        .foregroundColor(ticket.status.color)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(ticket.status.color.opacity(0.2))
                        .cornerRadius(4)
                }
                
                // Venue and date
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ticket.venueName)
                            .font(.system(size: 14))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                        
                        Text("\(ticket.displayDate) at \(ticket.time)")
                            .font(.system(size: 14))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(ticket.seats)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                        
                        Text(ticket.price)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.blue)
                    }
                }
            }
            .padding()
            .background(Color(red: 0.122, green: 0.161, blue: 0.216))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(red: 0.216, green: 0.255, blue: 0.318), lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Ticket Detail Modal
struct TicketDetailModalView: View {
    let ticket: TicketItem
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // QR Code placeholder
                Rectangle()
                    .fill(Color.white)
                    .frame(width: 200, height: 200)
                    .cornerRadius(12)
                    .overlay(
                        VStack {
                            Image(systemName: "qrcode")
                                .font(.system(size: 64))
                                .foregroundColor(.black)
                            Text(ticket.qrCode)
                                .font(.caption)
                                .foregroundColor(.black)
                        }
                    )
                
                // Ticket details
                VStack(spacing: 16) {
                    Text(ticket.showTitle)
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    
                    VStack(spacing: 8) {
                        DetailRow(label: "Venue", value: ticket.venueName)
                        DetailRow(label: "Date", value: ticket.displayDate)
                        DetailRow(label: "Time", value: ticket.time)
                        DetailRow(label: "Seats", value: ticket.seats)
                        DetailRow(label: "Price", value: ticket.price)
                        DetailRow(label: "Status", value: ticket.status.displayName)
                    }
                }
                
                Spacer()
            }
            .padding()
            .background(Color(red: 0.067, green: 0.094, blue: 0.153))
            .navigationTitle("Ticket Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Detail Row Component
struct DetailRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
            
            Spacer()
            
            Text(value)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
        }
        .padding(.horizontal)
    }
}

// MARK: - Preview
#Preview {
    TicketsView()
}