//
//  AccountView.swift
//  LML-proj
//
//  Clean account view for v1 API integration
//  Simple authentication states without complex fallback logic
//

import SwiftUI

struct AccountView: View {
    @State private var isSignedIn = false
    @State private var userEmail = "user@example.com"
    @State private var userName = "John Doe"
    @State private var showingSignIn = false
    @State private var showingSignUp = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    
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
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.large)
            .preferredColorScheme(.dark)
        }
        .navigationBarBackButtonHidden(true) // Disable swipe-back
        .sheet(isPresented: $showingSignIn) {
            SignInModalView(isPresented: $showingSignIn, onSuccess: handleSignInSuccess)
        }
        .sheet(isPresented: $showingSignUp) {
            SignUpModalView(isPresented: $showingSignUp, onSuccess: handleSignUpSuccess)
        }
    }
    
    // MARK: - Content Views
    
    private var loadingContent: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
                .tint(.white)
            
            Text("Loading your account...")
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
                // User Avatar Placeholder
                Circle()
                    .fill(Color(red: 0.216, green: 0.255, blue: 0.318))
                    .frame(width: 120, height: 120)
                    .overlay(
                        Image(systemName: "person.fill")
                            .font(.system(size: 48))
                            .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                    )
                    .padding(.top, 40)
                
                Text("Welcome to LML")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                
                Text("Sign in to save your tickets and get personalized recommendations")
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
                Button(action: browseShows) {
                    Text("Browse Shows")
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
            // User Profile Header
            VStack(spacing: 16) {
                // User Avatar
                Circle()
                    .fill(Color.blue)
                    .frame(width: 100, height: 100)
                    .overlay(
                        Text(String(userName.prefix(1)))
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(.white)
                    )
                
                VStack(spacing: 4) {
                    Text(userName)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    
                    Text(userEmail)
                        .font(.subheadline)
                        .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
                }
            }
            .padding(.top, 20)
            
            // User Stats Section
            VStack(spacing: 12) {
                HStack {
                    Text("Your Activity")
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Spacer()
                }
                
                HStack(spacing: 12) {
                    StatCard(title: "Tickets", value: "5", icon: "ticket", color: .blue)
                    Spacer()
                    StatCard(title: "Shows", value: "3", icon: "theatermasks", color: .green)
                    Spacer()
                    StatCard(title: "Venues", value: "2", icon: "building.2", color: .orange)
                }
            }
            
            // Account Actions
            VStack(spacing: 12) {
                AccountActionRow(icon: "gearshape", title: "Settings", action: {
                    print("Settings tapped")
                })
                
                AccountActionRow(icon: "questionmark.circle", title: "Help & Support", action: {
                    print("Support tapped")
                })
                
                AccountActionRow(icon: "shield", title: "Privacy Policy", action: {
                    print("Privacy tapped")
                })
                
                AccountActionRow(icon: "info.circle", title: "About", action: {
                    print("About tapped")
                })
                
                // Sign Out Button
                Button(action: signOut) {
                    HStack {
                        Image(systemName: "arrow.backward.circle")
                        Text("Sign Out")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .foregroundColor(.red)
                    .cornerRadius(12)
                    .font(.system(size: 16, weight: .semibold))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.red, lineWidth: 1)
                    )
                }
                .padding(.top, 8)
            }
        }
    }
    
    // MARK: - Actions
    
    private func browseShows() {
        // This would typically switch to the Home tab
        // For now, just print the action
        print("Browse Shows tapped - switching to Home tab")
    }
    
    private func handleSignInSuccess(email: String, name: String) {
        isSignedIn = true
        userEmail = email
        userName = name
        showingSignIn = false
    }
    
    private func handleSignUpSuccess(email: String, name: String) {
        isSignedIn = true
        userEmail = email
        userName = name
        showingSignUp = false
    }
    
    private func signOut() {
        isSignedIn = false
        userEmail = ""
        userName = ""
        errorMessage = nil
    }
}

// MARK: - Stat Card Component
struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(color)
            
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
            
            Text(title)
                .font(.caption)
                .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(red: 0.122, green: 0.161, blue: 0.216))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(red: 0.216, green: 0.255, blue: 0.318), lineWidth: 1)
        )
    }
}

// MARK: - Account Action Row Component
struct AccountActionRow: View {
    let icon: String
    let title: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(.blue)
                    .frame(width: 24)
                
                Text(title)
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundColor(Color(red: 0.612, green: 0.639, blue: 0.686))
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

// MARK: - Sign In Modal (Placeholder)
struct SignInModalView: View {
    @Binding var isPresented: Bool
    let onSuccess: (String, String) -> Void
    
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Sign In")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .padding(.top, 20)
                
                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    
                    SecureField("Password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
                .padding(.horizontal)
                
                Button(action: signIn) {
                    Text(isLoading ? "Signing In..." : "Sign In")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .disabled(isLoading || email.isEmpty || password.isEmpty)
                .padding(.horizontal)
                
                Spacer()
            }
            .preferredColorScheme(.dark)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
        }
    }
    
    private func signIn() {
        isLoading = true
        
        // Simulate sign in
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isLoading = false
            onSuccess(email, "John Doe") // Mock successful sign in
        }
    }
}

// MARK: - Sign Up Modal (Placeholder)
struct SignUpModalView: View {
    @Binding var isPresented: Bool
    let onSuccess: (String, String) -> Void
    
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Create Account")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .padding(.top, 20)
                
                VStack(spacing: 16) {
                    TextField("Full Name", text: $name)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                    
                    TextField("Email", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    
                    SecureField("Password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
                .padding(.horizontal)
                
                Button(action: signUp) {
                    Text(isLoading ? "Creating Account..." : "Create Account")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .disabled(isLoading || email.isEmpty || password.isEmpty || name.isEmpty)
                .padding(.horizontal)
                
                Spacer()
            }
            .preferredColorScheme(.dark)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
        }
    }
    
    private func signUp() {
        isLoading = true
        
        // Simulate sign up
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isLoading = false
            onSuccess(email, name)
        }
    }
}

// MARK: - Preview
#Preview {
    AccountView()
}