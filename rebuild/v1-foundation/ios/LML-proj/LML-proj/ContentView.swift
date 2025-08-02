//
//  ContentView.swift
//  LML-proj
//
//  Main content view with tab navigation
//  Clean implementation with HomeView and placeholder tabs
//

import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 1 // Default to Home tab (center)
    
    var body: some View {
        TabView(selection: $selectedTab) {
            // Account Tab (moved to left)
            AccountView()
                .tabItem {
                    Image(systemName: selectedTab == 0 ? "person.fill" : "person")
                    Text("Account")
                }
                .tag(0)
            
            // Home Tab (now in center)
            HomeView()
                .tabItem {
                    Image(systemName: selectedTab == 1 ? "house.fill" : "house")
                    Text("Home")
                }
                .tag(1)
            
            // Tickets Tab (stays on right)
            TicketsView()
                .tabItem {
                    Image(systemName: selectedTab == 2 ? "ticket.fill" : "ticket")
                    Text("Tickets")
                }
                .tag(2)
        }
        .accentColor(.blue)
        .preferredColorScheme(.dark)
    }
}



// MARK: - Preview
#Preview {
    ContentView()
}
