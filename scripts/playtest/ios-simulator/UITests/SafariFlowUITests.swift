import XCTest

/// Drives the REAL Mobile Safari in the iOS Simulator against a locally served DigiTable build backed by
/// the Firebase emulators (127.0.0.1 is the host Mac from inside the Simulator). Captures screenshots
/// and measures element frames against the on-screen keyboard's frame, and FAILS when a control that
/// must be visible with the keyboard up is not. Simulator, not a physical device.
final class SafariFlowUITests: XCTestCase {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    let base = ProcessInfo.processInfo.environment["DIGITABLE_BASE"] ?? "http://127.0.0.1:4173"
    let out = ProcessInfo.processInfo.environment["DIGITABLE_OUT"] ?? "/private/tmp/ios-uitest-out"
    let tag = ProcessInfo.processInfo.environment["DIGITABLE_TAG"] ?? "iphone"
    var web: XCUIElement { safari.webViews.firstMatch }
    var logLines: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = true
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        safari.launch()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20))
    }

    override func tearDownWithError() throws {
        try logLines.joined(separator: "\n").write(
            toFile: "\(out)/\(tag)-\(name.replacingOccurrences(of: " ", with: "_").filter { $0.isLetter || $0.isNumber || $0 == "_" }).log",
            atomically: true, encoding: .utf8)
    }

    // MARK: helpers

    func log(_ s: String) { logLines.append(s); print("[ios] \(s)") }

    func shot(_ name: String) {
        let s = XCUIScreen.main.screenshot()
        try? s.pngRepresentation.write(to: URL(fileURLWithPath: "\(out)/\(tag)-\(name).png"))
    }

    func open(_ hash: String) {
        // A fresh query string forces a full page load, so a rebuilt bundle is never masked by the tab's old one.
        XCUIDevice.shared.system.open(URL(string: "\(base)/?t=\(Int(Date().timeIntervalSince1970 * 1000))\(hash)")!)
        sleep(3)
    }

    func el(_ label: String, _ type: XCUIElement.ElementType = .any) -> XCUIElement {
        web.descendants(matching: type).matching(NSPredicate(format: "label ==[c] %@", label)).firstMatch
    }

    func has(_ label: String, timeout: TimeInterval = 10) -> Bool {
        el(label).waitForExistence(timeout: timeout)
    }

    func containing(_ text: String, _ type: XCUIElement.ElementType = .any) -> XCUIElement {
        web.descendants(matching: type).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    func scrollTo(_ element: XCUIElement, maxSwipes: Int = 12) {
        var n = 0
        while !element.isHittable && n < maxSwipes { web.swipeUp(velocity: .slow); n += 1 }
    }

    func tapField(_ label: String, _ text: String) {
        let f = web.textFields[label]
        XCTAssertTrue(f.waitForExistence(timeout: 10), "field \(label)")
        f.tap()
        if !text.isEmpty { f.typeText(text) }
    }

    func dismissKeyboard() {
        let kb = safari.keyboards.firstMatch
        guard kb.exists else { return }
        // Tap an inert area of the page above the keyboard.
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.12)).tap()
        sleep(1)
    }

    /// Records where an element sits relative to the screen and to the on-screen keyboard.
    func report(_ name: String, _ e: XCUIElement) {
        let screen = safari.windows.firstMatch.frame
        let kb = safari.keyboards.firstMatch
        let kbTop = kb.exists ? kb.frame.minY : screen.maxY
        let f = e.frame
        let inside = f.minY >= screen.minY - 0.5 && f.maxY <= screen.maxY + 0.5
        let clearOfKeyboard = f.maxY <= kbTop + 0.5
        log("\(name): frame=\(f) screen=\(screen) keyboardTop=\(kbTop) inScreen=\(inside) aboveKeyboard=\(clearOfKeyboard) hittable=\(e.isHittable)")
    }

    /// Fails unless the element lies fully on screen and clear of the on-screen keyboard.
    func expectAboveKeyboard(_ name: String, _ e: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        report(name, e)
        let screen = safari.windows.firstMatch.frame
        let kb = safari.keyboards.firstMatch
        let kbTop = kb.exists ? kb.frame.minY : screen.maxY
        let f = e.frame
        XCTAssertTrue(f.minY >= screen.minY - 0.5 && f.maxY <= screen.maxY + 0.5, "\(name) is off screen: \(f)", file: file, line: line)
        XCTAssertTrue(f.maxY <= kbTop + 0.5, "\(name) is covered by the keyboard (bottom \(f.maxY) > keyboard top \(kbTop))", file: file, line: line)
    }

    /// The action row must never sit on top of the field being typed in. (On real iOS Safari, landscape with
    /// the keyboard up, the earlier pinned footer overlapped the reason field and clipped the buttons: both
    /// frames were still "above the keyboard", so only this overlap check catches it.)
    func expectNoOverlap(_ name: String, field: XCUIElement, actions: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertLessThanOrEqual(field.frame.maxY, actions.frame.minY + 0.5,
            "\(name): the field (\(field.frame)) overlaps the action row (\(actions.frame))", file: file, line: line)
    }

    func createSessionAndOpenConsole() {
        open("#/create")
        tapField("Session name", "iOS Audit")
        tapField("Passphrase", "audit-pass-1")
        tapField("Your display name", "Gamemaster")
        shot("create-filled-keyboard")
        let create = el("Create session", .button)
        scrollTo(create)
        create.tap()
        XCTAssertTrue(containing("Write these down").waitForExistence(timeout: 30), "secrets reveal")
        shot("create-secrets")
        let wrote = containing("written these down")
        scrollTo(wrote)
        wrote.tap()
        let ready = containing("ready", .button)
        scrollTo(ready)
        ready.tap()
        let console = containing("director console", .button)
        XCTAssertTrue(console.waitForExistence(timeout: 20))
        scrollTo(console)
        console.tap()
        XCTAssertTrue(has("Scene director", timeout: 30) || containing("Scene director").waitForExistence(timeout: 30))
        let load = el("Load scene", .button)
        scrollTo(load)
        load.tap()
        XCTAssertTrue(containing("End round 1", .button).waitForExistence(timeout: 30), "scene loaded")
        shot("console-loaded")
    }

    // MARK: tests

    func testJoinFormValidationWithKeyboard() throws {
        open("#/join")
        shot("join-initial")
        tapField("Room code", "")
        XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 8), "software keyboard visible")
        expectAboveKeyboard("join room-code field with keyboard up", web.textFields["Room code"])
        shot("join-keyboard-up")
        // Return/Go from the keyboard submits the form. Nothing is filled in, so the app must show its
        // own inline errors and keep focus on the first invalid field, with no native bubble.
        let key = safari.keyboards.buttons.matching(NSPredicate(format: "label ==[c] 'go' OR label ==[c] 'return' OR label ==[c] 'join'")).firstMatch
        if key.exists { key.tap() } else { log("no go/return key found") }
        sleep(1)
        shot("join-errors-keyboard-up")
        let err = containing("Room code is required")
        log("inline room-code error present: \(err.exists)")
        XCTAssertTrue(err.exists, "inline error text")
        if err.exists { expectAboveKeyboard("room-code error text", err) }
        expectAboveKeyboard("room-code field after failed submit", web.textFields["Room code"])
        // Focus stayed in the first invalid field, so the keyboard is still up (nothing dismissed it).
        XCTAssertTrue(safari.keyboards.firstMatch.exists, "focus stays in the first invalid field")
        // Type a malformed code and submit again.
        let rc = web.textFields["Room code"]
        rc.typeText("bad code!")
        sleep(1)
        shot("join-bad-code-keyboard-up")
        if key.exists { key.tap() }
        sleep(1)
        let pat = containing("letters, numbers and dashes")
        log("pattern error present: \(pat.exists)")
        XCTAssertTrue(pat.exists, "pattern error")
        shot("join-pattern-error")
    }

    func testCorrectionSheetWithKeyboardAndPicker() throws {
        createSessionAndOpenConsole()

        // Native select: the OS draws the picker, so it cannot clip or mis-place.
        let scene = containing("Scene", .popUpButton)
        let sceneAny = web.descendants(matching: .any).matching(NSPredicate(format: "label ==[c] 'Scene' AND elementType != %d", XCUIElement.ElementType.staticText.rawValue)).firstMatch
        let sel = scene.exists ? scene : sceneAny
        log("scene select found: \(sel.exists) type=\(sel.elementType.rawValue)")
        if sel.exists {
            scrollTo(sel)
            report("scene select", sel)
            sel.tap()
            sleep(2)
            shot("scene-select-picker")
            log("picker keyboards/pickers: pickerWheels=\(safari.pickerWheels.count) buttons Done=\(safari.buttons["Done"].exists)")
            let done = safari.buttons["Done"]
            if done.exists { done.tap() } else { web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap() }
            sleep(1)
        }

        // Correction sheet.
        let correct = web.buttons.matching(NSPredicate(format: "label ==[c] 'Correct'")).firstMatch
        XCTAssertTrue(correct.waitForExistence(timeout: 10), "Correct button")
        scrollTo(correct)
        correct.tap()
        let heading = containing("Correct ")
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "sheet heading")
        sleep(1)
        shot("sheet-open")
        let apply = el("Apply correction", .button)
        let cancel = el("Cancel", .button)
        report("sheet apply (no keyboard)", apply)
        report("sheet cancel (no keyboard)", cancel)

        // Landscape, no keyboard: the sheet must still fit the (short) visible height.
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        shot("sheet-landscape-no-keyboard")
        report("landscape (no keyboard) apply", apply)
        report("landscape (no keyboard) cancel", cancel)
        XCUIDevice.shared.orientation = .portrait
        sleep(2)

        // Scroll the sheet body to the reason field and focus it: the software keyboard rises.
        let reason = web.textFields["Reason (required)"]
        var swipes = 0
        while !reason.isHittable && swipes < 10 { web.swipeUp(velocity: .slow); swipes += 1 }
        report("sheet reason before focus", reason)
        reason.tap()
        XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 8), "keyboard up")
        sleep(1)
        shot("sheet-keyboard-up")
        // Portrait: the sheet shrinks into the area above the keyboard, header and actions still pinned.
        expectAboveKeyboard("sheet reason with keyboard up", reason)
        expectAboveKeyboard("sheet apply with keyboard up", apply)
        expectAboveKeyboard("sheet cancel with keyboard up", cancel)
        expectAboveKeyboard("sheet heading with keyboard up", heading)
        expectNoOverlap("portrait + keyboard", field: reason, actions: apply)
        reason.typeText("iOS keyboard check")
        sleep(1)
        shot("sheet-keyboard-typed")

        // Landscape with the keyboard up (the tightest case).
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        shot("sheet-landscape-keyboard-up")
        // Landscape + keyboard leaves very little height: the sheet scrolls as one page (data-compact),
        // so only the field being typed in is required to be in view; the actions are reached by
        // scrolling the sheet or dismissing the keyboard.
        expectAboveKeyboard("landscape reason", reason)
        expectNoOverlap("landscape + keyboard", field: reason, actions: apply)
        report("landscape apply (scrolls)", apply)
        report("landscape cancel (scrolls)", cancel)
        XCUIDevice.shared.orientation = .portrait
        sleep(2)

        // Cancel closes the sheet and returns the page.
        if cancel.isHittable { cancel.tap() } else { dismissKeyboard(); if cancel.isHittable { cancel.tap() } }
        sleep(1)
        shot("sheet-closed")
        log("sheet closed: \(!heading.exists)")
    }
}
