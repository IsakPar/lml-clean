//
//  LMLTests.swift
//  LMLTests
//
//  Basic test suite for clean iOS implementation
//

import XCTest
@testable import LML

final class LMLTests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    func testEnvironmentConfiguration() throws {
        let config = EnvironmentConfig.shared
        XCTAssertTrue(config.validateConfiguration())
        XCTAssertFalse(config.appVersion.isEmpty)
    }

    func testPerformanceExample() throws {
        // This is an example of a performance test case.
        self.measure {
            // Put the code you want to measure the time of here.
        }
    }
}