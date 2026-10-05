import SwiftUI

// An empty host app: the XCUITest bundle drives Mobile Safari, not this app.
@main
struct IosPlaytestApp: App {
    var body: some Scene {
        WindowGroup { Text("DigiTable iOS playtest host") }
    }
}
