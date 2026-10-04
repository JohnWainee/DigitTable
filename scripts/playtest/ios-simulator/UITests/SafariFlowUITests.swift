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
    var roomCode = ""
    /// Seconds the GM's scene may take to arrive. It includes callable latency, so a cold deployed project may
    /// need more; it must stay well under the 30 s fallback poll to prove the live listener works.
    let sceneBudget = Double(ProcessInfo.processInfo.environment["DIGITABLE_SCENE_BUDGET"] ?? "") ?? 20

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

    func open(_ hash: String, origin: String? = nil) {
        // A fresh query string forces a full page load, so a rebuilt bundle is never masked by the tab's old one.
        XCUIDevice.shared.system.open(URL(string: "\(origin ?? base)/?t=\(Int(Date().timeIntervalSince1970 * 1000))\(hash)")!)
        sleep(3)
    }

    /// The second browser identity: `localhost` is a different origin from `127.0.0.1`, so it has its own
    /// anonymous-auth storage and Safari keeps both sessions side by side in the one Simulator.
    var playerOrigin: String { base.replacingOccurrences(of: "127.0.0.1", with: "localhost") }

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

    /// Scrolls with short drags, toward wherever the element is, until it is hittable; returns the number of
    /// drags. Drags are short (30% of the view) so it overshoots far less than a swipe loop, and it settles
    /// before returning; it scrolls toward the element whether it is below or above (or partly above) the
    /// visible area. Callers still re-check after a pause.
    @discardableResult
    func bringIntoView(_ element: XCUIElement, maxDrags: Int = 80) -> Int {
        var drags = 0
        while !element.isHittable && drags < maxDrags {
            let area = web.frame
            // Unknown or off-screen above: scroll up the page (finger moves down); otherwise scroll down.
            let above = element.exists && element.frame.minY < area.minY
            let from: CGFloat = above ? 0.35 : 0.65
            let to: CGFloat = above ? 0.65 : 0.35
            web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
                .press(forDuration: 0.05, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: to)))
            drags += 1
        }
        if drags > 0 { sleep(1) } // let momentum settle before the caller reads frames or takes a screenshot
        return drags
    }

    /// Writes the app's accessibility tree next to the screenshots, for a failure that needs a post-mortem.
    func dumpTree(_ name: String) {
        try? safari.debugDescription.write(toFile: "\(out)/\(tag)-\(name)-tree.txt", atomically: true, encoding: .utf8)
    }

    func tapField(_ label: String, _ text: String) {
        let f = web.textFields[label]
        XCTAssertTrue(f.waitForExistence(timeout: 10), "field \(label)")
        // Not the centre: on a 667pt phone with the keyboard already up, a tap at the middle or lower part of the
        // next field left the keyboard dismissed and nothing focused (iPhone SE (3rd generation), iOS 26.5). Safari's
        // own address capsule and form-assist bar are drawn just below that field (the capsule's accessibility frame
        // starts 7pt above the field's bottom edge), but the exact mechanism is not established; what was measured
        // is that taps in the upper part of the field focus it every time and centre taps did not.
        // A coordinate tap, unlike `tap()`, does not scroll the element into view first.
        if !f.isHittable { bringIntoView(f) }
        f.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.25)).tap()
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
        // The room code is the only element whose label looks like XXXXX-XXXXX.
        let codeEl = web.descendants(matching: .any).matching(NSPredicate(format: "label MATCHES %@", "[A-Z0-9]{4,}-[A-Z0-9]{4,}")).firstMatch
        if codeEl.waitForExistence(timeout: 5) { roomCode = codeEl.label }
        if roomCode.isEmpty { log("reveal labels: " + web.descendants(matching: .any).allElementsBoundByIndex.prefix(60).map { "\($0.elementType.rawValue):\($0.label)" }.joined(separator: " | ")) }
        log("room code captured: \(roomCode.isEmpty ? "NO" : "yes")")
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
        let loadedAt = Date()
        let sceneLoaded = containing("End round 1", .button).waitForExistence(timeout: 90)
        log("scene appeared \(String(format: "%.1f", Date().timeIntervalSince(loadedAt))) s after tapping Load scene: \(sceneLoaded)")
        if !sceneLoaded { dumpTree("scene-not-loaded") }
        XCTAssertTrue(sceneLoaded, "scene loaded")
        // The page's live listener, not its 30 s fallback poll, must have delivered it: against the emulators
        // Mobile Safari only received updates by that poll (30.1 s, every run) until the emulator client
        // forced long polling (`apps/web/src/firebase/firestore.ts`; 1.1 s). Staging, on the default
        // transport, measured 4.1 s.
        XCTAssertLessThan(Date().timeIntervalSince(loadedAt), sceneBudget, "the scene reached the GM through the live listener (budget \(sceneBudget) s, which includes Functions latency)")
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
        // The <h2> itself (a static text), not the dialog container whose label also starts with "Correct ".
        let heading = web.descendants(matching: .staticText).matching(NSPredicate(format: "label CONTAINS[c] 'Correct '")).firstMatch
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "sheet heading")
        sleep(1)
        shot("sheet-open")
        XCTAssertLessThan(heading.frame.height, 120, "the heading element is the title, not the dialog container: \(heading.frame)")
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

    // MARK: signed-in surfaces

    /// A bottom-pinned control must lie fully inside the web view's visible area and be tappable
    /// without scrolling, whatever state Safari's toolbar is in.
    func expectPinned(_ name: String, _ e: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        let visible = web.frame
        let f = e.frame
        log("\(name): frame=\(f) web=\(visible) hittable=\(e.isHittable) exists=\(e.exists)")
        XCTAssertTrue(e.exists, "\(name) exists", file: file, line: line)
        XCTAssertTrue(f.minY >= visible.minY - 0.5 && f.maxY <= visible.maxY + 0.5, "\(name) is outside the visible web area \(visible): \(f)", file: file, line: line)
        XCTAssertTrue(e.isHittable, "\(name) is not hittable", file: file, line: line)
    }

    /// Logs the throwaway debug overlay when a build carries one (innerHeight, visual viewport, dock state).
    func logViewport(_ name: String) {
        let o = containing("iH=")
        log("\(name): " + (o.exists ? o.label : "no overlay"))
    }

    func joinAsPlayerAndClaim() {
        open("#/join", origin: playerOrigin)
        tapField("Room code", roomCode)
        tapField("Passphrase", "audit-pass-1")
        tapField("Your display name", "Ada")
        let join = el("Join session", .button)
        scrollTo(join)
        join.tap()
        let wrote = containing("wrote it down", .button)
        XCTAssertTrue(wrote.waitForExistence(timeout: 30), "player recovery reveal")
        scrollTo(wrote)
        wrote.tap()
        let claim = el("Claim", .button)
        XCTAssertTrue(claim.waitForExistence(timeout: 30), "roster")
        shot("player-roster")
        scrollTo(claim)
        claim.tap()
        let cont = containing("Continue to your dashboard", .button)
        scrollTo(cont)
        cont.tap()
        XCTAssertTrue(containing("Choose an action").waitForExistence(timeout: 30), "compose step")
    }

    func testSignedInDockInRealSafari() throws {
        createSessionAndOpenConsole()
        XCTAssertFalse(roomCode.isEmpty, "room code captured")
        joinAsPlayerAndClaim()
        sleep(2)
        shot("player-compose-top")

        // The Declare dock at the top of a ~2,600px page, then mid-page, then after Safari's toolbar has collapsed.
        let declare = el("Declare action", .button)
        // At the top the dock's panel is still below the fold, so the dock is correctly not on screen yet.
        log("compose dock at top (panel below the fold, expected off screen): hittable=\(declare.isHittable)")
        for step in 1...3 {
            web.swipeUp(velocity: .slow)
            sleep(1)
            shot("player-compose-scroll-\(step)")
            expectPinned("compose dock after scroll \(step)", declare)
        }
        for _ in 0..<12 { web.swipeUp(velocity: .fast) }
        sleep(1)
        shot("player-compose-bottom")
        expectPinned("compose dock at page bottom", declare)
        for _ in 0..<12 { web.swipeDown(velocity: .fast) }
        sleep(1)

        // Rotate: the dock must stay on screen in landscape too.
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        shot("player-compose-landscape")
        logViewport("landscape at top (chrome expanded)")
        // Scroll until the Compose panel's own rows are on screen: the dock must now be pinned and tappable.
        // On the iPhone, landscape with Safari's tab bar and address bar showing leaves 292 CSS px, and the
        // `max-height` media query keeps reading 292 even after scrolling collapses the bars (innerHeight 402).
        // The dock used to be released under 320px, so Declare action sat at the end of the form (hittable false).
        let firstStat = containing("Brawl (")
        let swipes = bringIntoView(firstStat)
        XCTAssertGreaterThan(swipes, 0, "the Compose rows were reached by scrolling, not already on screen at the top")
        // A swipe's momentum can carry the rows past the screen after they were first seen (measured on iPhone SE
        // (3rd generation) landscape), so settle and bring them back before asserting.
        sleep(1)
        _ = bringIntoView(firstStat)
        shot("player-compose-landscape-scrolled")
        logViewport("landscape with the panel on screen")
        XCTAssertTrue(firstStat.isHittable, "landscape: the Compose rows are on screen")
        expectPinned("landscape dock, panel on screen (bars collapsed on iPhone)", declare)
        // Scrolling back up brings the bars back on iPhone (292px visible). A short drag (a full swipe would carry
        // the panel off screen) re-centres on the panel; the dock must not be released there either. On iPad there
        // are no such bars, so this is simply a second pinned position.
        func drag(_ fromY: CGFloat, _ toY: CGFloat) {
            web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: fromY))
                .press(forDuration: 0.1, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: toY)))
            sleep(1)
        }
        drag(0.45, 0.6)
        // If that carried the rows out of view (iPad, no bars to restore), nudge back the other way.
        var nudges = 0
        while !firstStat.isHittable && nudges < 4 { drag(0.6, 0.45); nudges += 1 }
        shot("player-compose-landscape-bars-back")
        logViewport("landscape, scrolled up again (bars showing on iPhone)")
        XCTAssertTrue(firstStat.isHittable, "landscape (bars showing): the Compose rows are still on screen")
        expectPinned("landscape dock, panel on screen (bars showing on iPhone)", declare)
        XCUIDevice.shared.orientation = .portrait
        sleep(2)
        // Back in the middle of the panel after rotating back.
        for _ in 0..<3 { web.swipeUp(velocity: .slow) }
        sleep(1)
        expectPinned("compose dock after rotating back", declare)

        // Declare, then the GM's pending card and its dock.
        XCTAssertTrue(declare.isEnabled, "declare enabled")
        declare.tap()
        XCTAssertTrue(containing("Declared").waitForExistence(timeout: 30), "declared state")
        shot("player-declared")

        open("#/", origin: base)
        let resume = containing("Resume session", .button)
        XCTAssertTrue(resume.waitForExistence(timeout: 20), "GM resume")
        scrollTo(resume)
        resume.tap()
        let roll = el("Roll it", .button)
        XCTAssertTrue(roll.waitForExistence(timeout: 30), "GM pending card")
        shot("gm-pending")
        scrollTo(roll)
        sleep(1)
        shot("gm-pending-scrolled")
        expectPinned("GM pending dock", roll)
        roll.tap()
        sleep(2)
        shot("gm-after-roll-tap")
    }
}
