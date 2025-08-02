//
//  LML_projApp.swift
//  LML-proj
//
//  Clean iOS app entry point for v1 API integration
//  SwiftUI App lifecycle with proper environment setup
//

import SwiftUI

@main
struct LML_projApp: App {
    
    init() {
        // Configure environment on app launch
        EnvironmentConfig.shared.printConfiguration()
        
        // Validate configuration
        if !EnvironmentConfig.shared.validateConfiguration() {
            print("⚠️ Environment configuration validation failed")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}
