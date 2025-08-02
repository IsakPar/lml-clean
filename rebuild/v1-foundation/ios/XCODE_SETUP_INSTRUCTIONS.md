# Xcode Project Setup Instructions

## Step 1: Create New Xcode Project

1. **Open Xcode**
2. **File → New → Project**
3. **Choose Template:**
   - Platform: **iOS**
   - Template: **App**
   - Click **Next**

4. **Project Options:**
   - **Product Name:** `LML`
   - **Team:** (Your development team)
   - **Organization Identifier:** `com.lml.app`
   - **Bundle Identifier:** `com.lml.app` (auto-generated)
   - **Language:** `Swift`
   - **Interface:** `SwiftUI`
   - **Use Core Data:** ❌ **UNCHECKED**
   - **Include Tests:** ✅ **CHECKED**
   - Click **Next**

5. **Save Location:**
   ```
   /Users/isakparild/Desktop/theone/rebuild/v1-foundation/ios/
   ```
   - Click **Create**

## Step 2: Verify Project Structure

After creation, you should have:
```
rebuild/v1-foundation/ios/LML/
├── LML.xcodeproj/          ← Xcode project file
├── LML/                    ← Main app
│   ├── LMLApp.swift       ← App entry point
│   ├── ContentView.swift  ← Main view
│   ├── Assets.xcassets/   ← App icons/assets
│   └── Preview Content/   ← Preview assets
└── LMLTests/               ← Unit tests
    └── LMLTests.swift
```

## Step 3: Test Initial Build

1. **Select Target:** `LML` (not LMLTests)
2. **Select Simulator:** iPhone 15 or similar
3. **Build:** ⌘ + B (should succeed)
4. **Run:** ⌘ + R (should show basic "Hello, world!" view)

## Step 4: Ready for File Replacement

Once the basic project builds successfully, let me know and I'll help you:

1. **Replace template files** with our clean v1 implementations
2. **Add our Core models** (Show.swift, SeatMap.swift, etc.)
3. **Add our API client** and ViewModels
4. **Configure Info.plist** for portrait-only orientation
5. **Add unit tests**

## Common Issues

**If you get build errors:**
- Check that **Interface** is set to **SwiftUI** (not UIKit)
- Verify **iOS Deployment Target** is 17.0+
- Make sure **Use Core Data** is unchecked

**If save location is wrong:**
- You can create the project anywhere and move it later
- Just make sure the final location is: `rebuild/v1-foundation/ios/LML/`

---

**Next:** Once project is created and builds, reply "Project created successfully" and I'll help replace the template files with our clean implementations.