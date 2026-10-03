import XCTest

/// Drive the REAL Mobile Safari in the iOS Simulator against a locally served DigiTable build (the
/// emulator-mode bundle behind page-logger-server.mjs, which logs the page's own visualViewport and
/// correction-sheet geometry). A Simulator is not a physical device; it is real iOS WebKit with the real
/// software keyboard, rotation and native pickers. Tests RECORD what happens (log lines + screenshots); the
/// few hard asserts each carry a positive control so they cannot pass vacuously.
///
/// Pitfalls this suite already handles (each cost a wrong measurement once; see README.md):
///  - a fresh Simulator shows Safari feature tips and a "slide to type" keyboard intro IN PLACE of the keyboard
///    (taller than the real one): dismissTips() / dismissKeyboardIntro();
///  - XCUITest `typeText` bypasses iOS autocapitalise/autocorrect: use softType() for anything about them;
///  - the Simulator can keep running a stale installed test runner: run.sh uninstalls it first.
final class SafariFlowUITests: XCTestCase {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    let base = ProcessInfo.processInfo.environment["DIGITABLE_BASE"] ?? "http://127.0.0.1:4175"
    let out = ProcessInfo.processInfo.environment["DIGITABLE_OUT"] ?? "/private/tmp/ios-uitest-out"
    let tag = ProcessInfo.processInfo.environment["DIGITABLE_TAG"] ?? "iphone"
    var web: XCUIElement { safari.webViews.firstMatch }
    var logLines: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = true
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        safari.launch()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20))
        XCUIDevice.shared.orientation = .portrait
    }

    override func tearDownWithError() throws {
        let safeName = name.filter { $0.isLetter || $0.isNumber || $0 == "_" }
        try logLines.joined(separator: "\n").write(
            toFile: "\(out)/\(tag)-\(safeName).log", atomically: true, encoding: .utf8)
    }

    // MARK: helpers

    func stamp() -> String { String(Int(Date().timeIntervalSince1970 * 1000)) }
    func log(_ s: String) { let line = "\(stamp()) \(s)"; logLines.append(line); print("[ios] \(line)") }

    func shot(_ name: String) {
        let s = XCUIScreen.main.screenshot()
        try? s.pngRepresentation.write(to: URL(fileURLWithPath: "\(out)/\(tag)-\(name).png"))
        log("SHOT \(name)")
    }

    /// First-run noise on a fresh simulator (Safari feature tips, keyboard "slide to type" intro): not app behaviour.
    func dismissTips() {
        for label in ["Close", "Dismiss", "Not Now", "Skip", "Continue", "OK"] {
            let b = safari.buttons[label]
            if b.exists && b.isHittable && label != "Continue" { log("TIP dismissing '\(label)'"); b.tap(); sleep(1) }
        }
        // The keyboard intro uses a Continue button inside the keyboard's own sheet.
        let kbContinue = safari.buttons["Continue"]
        if kbContinue.exists && kbContinue.isHittable && safari.keyboards.firstMatch.exists { log("TIP keyboard intro Continue"); kbContinue.tap(); sleep(1) }
    }

    /// iOS shows a one-time "slide to type" intro IN PLACE OF the keyboard on a fresh simulator. It is taller than the
    /// real keyboard, so any visual-viewport measurement taken while it is up is invalid. Always dismiss it first.
    func dismissKeyboardIntro() {
        let cont = safari.buttons["Continue"]
        if cont.waitForExistence(timeout: 2) { log("TIP keyboard intro Continue"); cont.tap(); sleep(2) }
    }

    func logKeyboardInfo(_ tag: String) {
        let kb = safari.keyboards.firstMatch
        log("KB \(tag): exists=\(kb.exists) frame=\(kb.exists ? "\(kb.frame)" : "-")")
        let screen = safari.windows.firstMatch.frame
        var shown = 0
        for b in safari.buttons.allElementsBoundByIndex {
            if shown >= 14 { break }
            if b.exists && b.frame.minY > screen.height * 0.30 && b.frame.height < 120 {
                log("KB-BTN \(tag): '\(b.label)' \(b.frame)"); shown += 1
            }
        }
    }

    func open(_ hash: String) {
        XCUIDevice.shared.system.open(URL(string: "\(base)/?t=\(Int(Date().timeIntervalSince1970 * 1000))\(hash)")!)
        sleep(3)
        dismissTips()
    }

    func el(_ label: String, _ type: XCUIElement.ElementType = .any) -> XCUIElement {
        web.descendants(matching: type).matching(NSPredicate(format: "label ==[c] %@", label)).firstMatch
    }
    func containing(_ text: String, _ type: XCUIElement.ElementType = .any) -> XCUIElement {
        web.descendants(matching: type).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }
    func scrollTo(_ element: XCUIElement, maxSwipes: Int = 14) {
        var n = 0
        while !element.isHittable && n < maxSwipes { web.swipeUp(velocity: .slow); n += 1 }
    }
    func valueOf(_ e: XCUIElement) -> String { (e.value as? String) ?? "<nil>" }

    func field(_ label: String) -> XCUIElement { web.textFields[label] }

    /// Taps a text field (scrolling it into reach first) and optionally types into it.
    func fill(_ label: String, _ text: String) {
        let f = field(label)
        XCTAssertTrue(f.waitForExistence(timeout: 10), "field \(label)")
        scrollTo(f)
        f.tap()
        dismissKeyboardIntro()
        dismissTips()
        if !safari.keyboards.firstMatch.waitForExistence(timeout: 3) { f.tap(); sleep(1); dismissTips() }
        if !text.isEmpty { f.typeText(text) }
    }

    func frameLine(_ name: String, _ e: XCUIElement) {
        let screen = safari.windows.firstMatch.frame
        let kb = safari.keyboards.firstMatch
        let kbTop = kb.exists ? kb.frame.minY : -1
        log("FRAME \(name): exists=\(e.exists) frame=\(e.frame) hittable=\(e.isHittable) screen=\(screen) keyboardTop=\(kbTop)")
    }

    func createSessionAndOpenConsole() {
        open("#/create")
        fill("Session name", "iOS Probe")
        fill("Passphrase", "probe-pass-1")
        fill("Your display name", "Gamemaster")
        let create = el("Create session", .button)
        scrollTo(create)
        create.tap()
        XCTAssertTrue(containing("Write these down").waitForExistence(timeout: 30), "secrets reveal")
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
        XCTAssertTrue(containing("Scene director").waitForExistence(timeout: 30))
        let load = el("Load scene", .button)
        scrollTo(load)
        load.tap()
        XCTAssertTrue(containing("End round 1", .button).waitForExistence(timeout: 30), "scene loaded")
    }

    func dismissKeyboard() {
        let done = safari.buttons["Done"]
        if done.exists { done.tap(); sleep(1); return }
        let kb = safari.keyboards.firstMatch
        if kb.exists { web.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.1)).tap(); sleep(1) }
    }

    // MARK: A. secret-entry attributes on the real iOS soft keyboard

    /// Taps the on-screen keys, which goes through iOS's own auto-shift and autocorrect. (XCUITest `typeText`
    /// injects key events that bypass both, so it cannot observe autocapitalize / autocorrect at all.)
    func key(_ label: String) -> XCUIElement { safari.keyboards.firstMatch.keys[label] }

    func onLettersLayer() -> Bool { key("q").exists || key("Q").exists }

    func ensureLetters() {
        if onLettersLayer() { return }
        for toggle in ["letters", "more, letters", "more"] where key(toggle).exists {
            key(toggle).tap(); return
        }
    }

    func ensureNumbers() {
        if !onLettersLayer() { return }
        for toggle in ["numbers", "more, numbers", "more"] where key(toggle).exists {
            key(toggle).tap(); return
        }
    }

    func softType(_ text: String) {
        for ch in text {
            let s = String(ch)
            if ch == " " { ensureLetters(); key("space").tap(); continue }
            let isLetter = ch.isLetter
            if isLetter { ensureLetters() } else { ensureNumbers() }
            var tapped = false
            for candidate in [s, s.uppercased(), s.lowercased()] {
                let k = key(candidate)
                if k.exists && k.isHittable { k.tap(); tapped = true; break }
            }
            if !tapped { log("SOFTTYPE could not find a key for '\(s)' (layer letters=\(onLettersLayer()))") }
        }
        ensureLetters()
    }

    func focusField(_ label: String) {
        let f = field(label)
        XCTAssertTrue(f.waitForExistence(timeout: 10), "field \(label)")
        scrollTo(f)
        f.tap()
        dismissKeyboardIntro()
        if !safari.keyboards.firstMatch.waitForExistence(timeout: 5) { f.tap(); sleep(1); dismissKeyboardIntro() }
    }

    /// The 2026-09-30 fix (ebac344) added autoCapitalize/autoCorrect/spellCheck to the code and passphrase fields
    /// and was recorded as "source-read, NOT test-verified": Chrome cannot see iOS capitalisation/autocorrect.
    /// This types with the real on-screen keys and reads the values back. A default-traits field is the positive
    /// control: if iOS does not touch it, the experiment would be vacuous.
    func testSecretEntryOnRealIOSSoftKeyboard() throws {
        open("#/join")
        XCTAssertTrue(field("Room code").waitForExistence(timeout: 15), "join form")
        shot("S1-join-initial")
        focusField("Your display name")
        log("KEYS letters layer: \(onLettersLayer()); keys: \(safari.keyboards.firstMatch.keys.allElementsBoundByIndex.prefix(70).map { $0.label }.joined(separator: "|"))")
        softType("teh ada")
        let control = valueOf(field("Your display name"))
        log("VALUE control (default traits) typed 'teh ada' via soft keys -> '\(control)'")

        focusField("Room code")
        softType("ab12cd")
        let room = valueOf(field("Room code"))
        log("VALUE room-code (autocapitalize=characters) typed 'ab12cd' -> '\(room)'")

        focusField("Passphrase")
        softType("teh wolfbane gate")
        let pass = valueOf(field("Passphrase"))
        log("VALUE passphrase (autocapitalize=none, autocorrect=off) typed 'teh wolfbane gate' -> '\(pass)'")
        shot("S2-join-secrets-typed")

        // Recovery entry (the lost-identity path).
        open("#/join")
        let lost = containing("Lost your browser", .button)
        XCTAssertTrue(lost.waitForExistence(timeout: 15), "recover button")
        scrollTo(lost)
        lost.tap()
        sleep(1)
        XCTAssertTrue(field("Recovery code").waitForExistence(timeout: 10), "recovery form")
        focusField("Recovery code")
        softType("abcd2345efgh")
        let rec = valueOf(field("Recovery code"))
        log("VALUE recovery-code (autocapitalize=characters) typed 'abcd2345efgh' -> '\(rec)'")
        shot("S3-recover-typed")

        // Positive control first: iOS must have changed the default field, or nothing below proves anything.
        XCTAssertNotEqual(control, "teh ada", "positive control: iOS should have auto-capitalised/autocorrected a default field")
        XCTAssertEqual(room, "AB12CD", "room code is upper-cased by autocapitalize=characters")
        XCTAssertEqual(pass, "teh wolfbane gate", "passphrase reaches the server exactly as typed")
        XCTAssertEqual(rec, "ABCD2345EFGH", "recovery code is upper-cased by autocapitalize=characters")
    }

    // MARK: B. native validation bubble (what the signed-out forms do on an empty submit)

    func testNativeValidationOnEmptySubmit() throws {
        open("#/join")
        let rc = field("Room code")
        XCTAssertTrue(rc.waitForExistence(timeout: 15))
        rc.tap()
        XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 8), "software keyboard visible")
        shot("validation-before-submit")
        frameLine("room-code before submit", rc)
        let key = safari.keyboards.buttons.matching(NSPredicate(format: "label ==[c] 'go' OR label ==[c] 'return' OR label ==[c] 'join'")).firstMatch
        log("KEY go/return exists=\(key.exists)")
        if key.exists { key.tap() }
        sleep(2)
        shot("validation-after-submit")
        let bubble = safari.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'fill out' OR label CONTAINS[c] 'Please fill' OR label CONTAINS[c] 'required'")).firstMatch
        // Native validation bubbles are drawn by Safari, outside the web view's accessibility tree, so this is
        // usually false even when the bubble is on screen; the screenshot above is the evidence.
        log("BUBBLE in accessibility tree: \(bubble.exists) (see the screenshot for what is drawn)")
        if bubble.exists { frameLine("native validation bubble", bubble) }
        frameLine("room-code after submit", rc)
    }

    // MARK: C. native <select> picker

    func testNativeSelectPicker() throws {
        createSessionAndOpenConsole()
        // The select shows the NEXT scene by default. Find the control itself (not its <label>, a static text).
        let pred = NSPredicate(format: "(label CONTAINS[c] 'Abandoned' OR value CONTAINS[c] 'Abandoned') AND elementType != %d", XCUIElement.ElementType.staticText.rawValue)
        let candidates = web.descendants(matching: .any).matching(pred)
        log("SELECT candidates (non-static) containing 'Abandoned': \(candidates.count)")
        for i in 0..<min(candidates.count, 4) {
            let c = candidates.element(boundBy: i)
            log("SELECT cand[\(i)] type=\(c.elementType.rawValue) label='\(c.label)' value='\(valueOf(c))' frame=\(c.frame)")
        }
        let sel = candidates.firstMatch
        if sel.exists {
            scrollTo(sel)
            frameLine("scene select (closed)", sel)
            shot("select-closed")
            sel.tap()
            sleep(2)
            shot("select-picker-open")
            // iOS 26 shows a popover list for a native select, not a wheel, so wheels=0 is expected; the screenshot is the record.
            log("PICKER wheels=\(safari.pickerWheels.count) doneButton=\(safari.buttons["Done"].exists)")
            if safari.pickerWheels.count > 0 {
                let wheel = safari.pickerWheels.firstMatch
                log("PICKER current value=\(valueOf(wheel))")
                wheel.adjust(toPickerWheelValue: "The Signal Mast")
                sleep(1)
                shot("select-picker-adjusted")
            }
            if safari.buttons["Done"].exists { safari.buttons["Done"].tap() }
            sleep(1)
            shot("select-after-done")
            log("SELECT value after pick=\(valueOf(sel)) label=\(sel.label)")
        } else { log("SELECT control not found") }
    }

    // MARK: D. the correction sheet with the REAL keyboard: portrait, rotate-while-open, landscape-first

    func openCorrectionSheet() -> XCUIElement {
        let correct = web.buttons.matching(NSPredicate(format: "label ==[c] 'Correct'")).firstMatch
        XCTAssertTrue(correct.waitForExistence(timeout: 10), "Correct button")
        scrollTo(correct)
        correct.tap()
        let heading = containing("Correct ")
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "sheet heading")
        sleep(1)
        return heading
    }

    func focusReason(_ tag: String) {
        let reason = field("Reason (required)")
        var swipes = 0
        while !reason.isHittable && swipes < 12 { web.swipeUp(velocity: .slow); swipes += 1 }
        reason.tap()
        dismissKeyboardIntro()
        XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 8), "keyboard up (\(tag))")
        sleep(2)
        logKeyboardInfo(tag)
        frameLine("reason (\(tag))", reason)
        frameLine("apply (\(tag))", el("Apply correction", .button))
        frameLine("cancel (\(tag))", el("Cancel", .button))
    }

    /// Drag inside the sheet (not the keyboard) so a single-scroll sheet moves; logs where Cancel/Apply end up.
    func dragSheetUp(_ tag: String, times: Int = 3) {
        for i in 0..<times {
            // Start INSIDE the visible sheet (about 48pt down in landscape; the sheet is only ~98pt tall there).
            let start = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12))
            let end = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.02))
            start.press(forDuration: 0.05, thenDragTo: end)
            sleep(1)
            frameLine("apply after drag \(i + 1) (\(tag))", el("Apply correction", .button))
            frameLine("cancel after drag \(i + 1) (\(tag))", el("Cancel", .button))
        }
    }

    func hideKeyboard(_ tag: String) {
        // Try the form-accessory "Done"; otherwise the keyboard's own return/hide key.
        for label in ["Done", "done", "Hide keyboard", "Dismiss keyboard"] {
            let b = safari.buttons[label]
            if b.exists { log("KEYBOARD hide via '\(label)'"); b.tap(); sleep(2); return }
        }
        log("KEYBOARD no hide button found (\(tag)); buttons listed above")
    }

    func testCorrectionSheetWithRealKeyboard() throws {
        createSessionAndOpenConsole()

        // P1: portrait, keyboard up (intro dismissed first).
        let heading = openCorrectionSheet()
        log("MARK P1-sheet-open-portrait")
        shot("P1-sheet-portrait-open")
        focusReason("P1-portrait-keyboard")
        log("MARK P1-portrait-keyboard-up")
        shot("P1-sheet-portrait-keyboard")
        field("Reason (required)").typeText("ios keyboard check")
        sleep(1)

        // P2: rotate to landscape WHILE the sheet and keyboard are open.
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        log("MARK P2-landscape-rotated-while-open")
        logKeyboardInfo("P2-landscape-rotated")
        frameLine("reason (P2)", field("Reason (required)"))
        frameLine("apply (P2)", el("Apply correction", .button))
        frameLine("cancel (P2)", el("Cancel", .button))
        log("VALUE reason after rotate -> '\(valueOf(field("Reason (required)")))'")
        shot("P2-sheet-landscape-keyboard-rotated")
        dragSheetUp("P2")
        log("MARK P2-after-drag")
        shot("P2-sheet-landscape-keyboard-after-drag")

        // P3: hide the keyboard in landscape.
        hideKeyboard("P3")
        log("MARK P3-landscape-after-hide-keyboard")
        logKeyboardInfo("P3-landscape-after-hide")
        frameLine("apply (P3)", el("Apply correction", .button))
        frameLine("cancel (P3)", el("Cancel", .button))
        shot("P3-sheet-landscape-no-keyboard")

        // P4: landscape, keyboard rises FRESH on a sheet that was already landscape.
        let reason = field("Reason (required)")
        if !reason.isHittable { web.swipeUp(velocity: .slow) }
        reason.tap()
        sleep(2)
        log("MARK P4-landscape-keyboard-fresh")
        logKeyboardInfo("P4-landscape-fresh")
        frameLine("reason (P4)", reason)
        frameLine("apply (P4)", el("Apply correction", .button))
        frameLine("cancel (P4)", el("Cancel", .button))
        shot("P4-sheet-landscape-keyboard-fresh")
        dragSheetUp("P4")
        log("MARK P4-after-drag")
        shot("P4-sheet-landscape-keyboard-after-drag")
        let cancelP4 = el("Cancel", .button)
        log("TOUCH cancel hittable with keyboard up in landscape: \(cancelP4.isHittable)")
        if cancelP4.isHittable { cancelP4.tap(); sleep(2) }
        log("TOUCH sheet closed by tapping Cancel with keyboard up: \(!heading.exists)")
        hideKeyboard("P4-end")

        // P5: back to portrait, then close.
        XCUIDevice.shared.orientation = .portrait
        sleep(3)
        log("MARK P5-back-to-portrait")
        shot("P5-sheet-portrait-after")
        let cancel = el("Cancel", .button)
        if cancel.isHittable { cancel.tap() }
        sleep(1)
        log("sheet closed: \(!heading.exists)")
        shot("P5-sheet-closed")

        // P6: landscape FIRST: rotate before the sheet is ever opened.
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        let heading2 = openCorrectionSheet()
        log("MARK P6-sheet-open-landscape-first")
        shot("P6-sheet-landscape-open")
        focusReason("P6-landscape-first-keyboard")
        log("MARK P6-landscape-first-keyboard-up")
        shot("P6-sheet-landscape-first-keyboard")
        hideKeyboard("P6-end")
        XCUIDevice.shared.orientation = .portrait
        sleep(2)
        if el("Cancel", .button).isHittable { el("Cancel", .button).tap() }
        sleep(1)
        log("sheet2 closed: \(!heading2.exists)")
    }
}
