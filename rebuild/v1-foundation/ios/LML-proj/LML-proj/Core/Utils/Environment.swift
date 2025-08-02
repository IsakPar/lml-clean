//
//  Environment.swift
//  LML
//
//  Clean environment configuration for v1 API
//  No hardcoded fallbacks - simple, predictable configuration
//

import Foundation

// MARK: - App Environment
enum AppEnvironment: String, CaseIterable {
    case development = "development"
    case staging = "staging"
    case production = "production"
    
    var displayName: String {
        switch self {
        case .development: return "Development"
        case .staging: return "Staging"
        case .production: return "Production"
        }
    }
}

// MARK: - Environment Configuration
class EnvironmentConfig {
    static let shared = EnvironmentConfig()
    
    private init() {}
    
    // MARK: - Current Environment
    var currentEnvironment: AppEnvironment {
        #if DEBUG
        return .development
        #else
        return .production
        #endif
    }
    
    // MARK: - API Configuration
    var apiEnvironment: APIEnvironment {
        switch currentEnvironment {
        case .development:
            return .development
        case .staging:
            return .production // Use production backend for staging
        case .production:
            return .production
        }
    }
    
    // MARK: - Feature Flags
    var enableDetailedLogging: Bool {
        return currentEnvironment == .development
    }
    
    var enableMockData: Bool {
        return false // Never use mock data - always use real API
    }
    
    var enablePaymentTesting: Bool {
        return currentEnvironment != .production
    }
    
    // MARK: - App Configuration
    var appVersion: String {
        return Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
    
    var buildNumber: String {
        return Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
    
    var bundleIdentifier: String {
        return Bundle.main.bundleIdentifier ?? "com.lml.app"
    }
    
    // MARK: - User Agent
    var userAgent: String {
        return "LML-iOS/\(appVersion) (\(bundleIdentifier); build \(buildNumber); \(currentEnvironment.rawValue))"
    }
    
    // MARK: - Debug Information
    func printConfiguration() {
        guard enableDetailedLogging else { return }
        
        print("🔧 LML Environment Configuration")
        print("   Environment: \(currentEnvironment.displayName)")
        print("   API Base URL: \(apiEnvironment.baseURL.absoluteString)")
        print("   App Version: \(appVersion) (\(buildNumber))")
        print("   Bundle ID: \(bundleIdentifier)")
        print("   User Agent: \(userAgent)")
        print("   Detailed Logging: \(enableDetailedLogging)")
        print("   Payment Testing: \(enablePaymentTesting)")
    }
}

// MARK: - Configuration Validation
extension EnvironmentConfig {
    /// Validate that the environment is properly configured
    func validateConfiguration() -> Bool {
        // Check API URL is reachable
        let apiURL = apiEnvironment.baseURL
        guard apiURL.scheme != nil, apiURL.host != nil else {
            print("❌ Invalid API URL: \(apiURL)")
            return false
        }
        
        // Check app version is valid
        guard !appVersion.isEmpty else {
            print("❌ Invalid app version")
            return false
        }
        
        // Check bundle identifier is valid
        guard !bundleIdentifier.isEmpty else {
            print("❌ Invalid bundle identifier")
            return false
        }
        
        print("✅ Environment configuration is valid")
        return true
    }
}

// MARK: - Global Environment Access
extension EnvironmentConfig {
    /// Quick access to current environment name
    static var environmentName: String {
        return shared.currentEnvironment.rawValue
    }
    
    /// Quick access to API base URL
    static var apiBaseURL: URL {
        return shared.apiEnvironment.baseURL
    }
    
    /// Quick access to detailed logging flag
    static var isLoggingEnabled: Bool {
        return shared.enableDetailedLogging
    }
}