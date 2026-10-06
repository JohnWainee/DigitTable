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
        // The field's own label must not be clipped by the sheet's pinned title (real iPad Safari,
        // landscape, keyboard up: ~266px visible, the label was half hidden under the title bar and
        // the field's border under the action row while the two checks above still passed).
        let reasonLabel = web.descendants(matching: .staticText).matching(NSPredicate(format: "label == 'Reason (required)'")).firstMatch
        XCTAssertTrue(reasonLabel.exists, "the reason label is exposed to accessibility")
        report("landscape reason label", reasonLabel)
        XCTAssertGreaterThanOrEqual(reasonLabel.frame.minY, heading.frame.maxY - 0.5,
            "landscape + keyboard: the reason label (\(reasonLabel.frame)) is under the sheet title (\(heading.frame))")
        XCTAssertLessThanOrEqual(reason.frame.maxY + 8, apply.frame.minY + 0.5,
            "landscape + keyboard: the field (\(reason.frame)) is flush against the action row (\(apply.frame)); its border is clipped")
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

    // MARK: text-entry attributes (lane sonnet-fi)

    func fieldValue(_ f: XCUIElement) -> String { (f.value as? String) ?? "" }

    /// Types by TAPPING the on-screen keys. `XCUIElement.typeText` synthesises the characters directly and
    /// bypasses the keyboard's auto-capitalisation and auto-correction (measured: the baseline build kept
    /// "cowboy-hat" verbatim under `typeText`), so only key taps reproduce what a person on a phone gets.
    /// Letters and the space bar only (no digit or punctuation layer).
    func tapKeys(_ text: String, file: StaticString = #filePath, line: UInt = #line) {
        for ch in text {
            let key = ch == " "
                ? safari.keyboards.keys["space"]
                : safari.keyboards.keys.matching(NSPredicate(format: "label ==[c] %@", String(ch))).firstMatch
            guard key.waitForExistence(timeout: 4) else {
                XCTFail("no on-screen key for \"\(ch)\"", file: file, line: line)
                return
            }
            key.tap()
        }
    }

    /// The first letter key shows as a capital when the keyboard has auto-shifted for the field.
    var keyboardIsShifted: Bool { safari.keyboards.keys["Q"].exists }

    /// Focuses the named field, taps `text` out on the soft keyboard and fails unless the field then holds
    /// exactly `expected` with the keyboard in the `shifted` state it opened in. iOS applies
    /// auto-capitalisation and auto-correction to a plain `<input type="text">`: a case-sensitive secret
    /// ("river stone" -> "River stone"), a recovery code drawn from an UPPERCASE-only alphabet typed in
    /// lowercase, or a GM-typed item id are silently altered, so a correct entry is rejected.
    func expectTyped(_ label: String, typing text: String, becomes expected: String, keyboardOpensShifted shifted: Bool,
                     file: StaticString = #filePath, line: UInt = #line) {
        let f = web.textFields[label]
        XCTAssertTrue(f.waitForExistence(timeout: 10), "field \(label)", file: file, line: line)
        if !f.isHittable { scrollTo(f) }
        f.tap()
        // The very first software keyboard of a cold Simulator takes a while to appear; if a tap landed
        // while the page was still settling (the previous keyboard sliding away), scroll and tap again.
        if !safari.keyboards.firstMatch.waitForExistence(timeout: 8) {
            scrollTo(f)
            f.tap()
        }
        XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 20), "software keyboard for \(label)", file: file, line: line)
        sleep(1)
        // A field below the fold must have been scrolled clear of the keyboard that just rose.
        expectAboveKeyboard("\(label) after focus", f)
        let opened = keyboardIsShifted
        tapKeys(text, file: file, line: line)
        let got = fieldValue(f)
        log("\(label): keyboard opened shifted=\(opened) (expected \(shifted)); tapped \"\(text)\": value is \"\(got)\" (expected \"\(expected)\")")
        XCTAssertEqual(opened, shifted, "\(label): keyboard shift state on focus", file: file, line: line)
        XCTAssertEqual(got, expected, "\(label): tapped \"\(text)\" but the field holds \"\(got)\"", file: file, line: line)
        dismissKeyboard()
    }

    /// The join, recover, create and table-display forms. `teh` is the classic auto-correction target
    /// ("the"); the capitalisation checks need no dictionary at all.
    func testCodeAndSecretFieldsKeepTypedTextVerbatim() throws {
        open("#/join")
        expectTyped("Room code", typing: "tehabc", becomes: "TEHABC", keyboardOpensShifted: true)
        expectTyped("Passphrase", typing: "teh river stone", becomes: "teh river stone", keyboardOpensShifted: false)
        shot("join-typed")

        // Recover mode: the recovery code alphabet is uppercase only and compared exactly.
        open("#/join")
        let recover = containing("Recover your seat", .button)
        XCTAssertTrue(recover.waitForExistence(timeout: 10), "recover button")
        scrollTo(recover)
        recover.tap()
        expectTyped("Room code", typing: "tehabc", becomes: "TEHABC", keyboardOpensShifted: true)
        expectTyped("Recovery code", typing: "abcdefghjkmn", becomes: "ABCDEFGHJKMN", keyboardOpensShifted: true)
        shot("recover-typed")

        open("#/create")
        expectTyped("Passphrase", typing: "teh river stone", becomes: "teh river stone", keyboardOpensShifted: false)
        shot("create-typed")

        open("#/table")
        expectTyped("Room code", typing: "tehabc", becomes: "TEHABC", keyboardOpensShifted: true)
        expectTyped("Table code", typing: "abcdefg", becomes: "ABCDEFG", keyboardOpensShifted: true)
        shot("table-typed")
    }

    /// GM tools: free-text ids that are matched exactly by the engine.
    func testGmIdFieldsKeepTypedTextVerbatim() throws {
        createSessionAndOpenConsole()
        expectTyped("Item id", typing: "cowboyhat", becomes: "cowboyhat", keyboardOpensShifted: false)
        expectTyped("New member id (blank to unassign)", typing: "teh member", becomes: "teh member", keyboardOpensShifted: false)
        shot("gm-ids-typed")
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

    /// Safari's Back action with the correction sheet open must dismiss ONLY the sheet. Before `useBackDismiss`
    /// it navigated the single-page app to the previous hash route, taking the sheet, the typed reason and the
    /// whole director console with it (measured in headless Chrome by `scripts/playtest/sheet-history-probe.mjs`;
    /// this is the same check in real Mobile Safari). The trigger is Safari's own Back button. A synthesized
    /// left-edge swipe is NOT used: XCUITest's drag did not start Safari's system gesture on the unfixed
    /// build (the page simply stayed put), so it could not prove anything either way.
    func testBackClosesOnlyTheSheet() throws {
        createSessionAndOpenConsole()
        let correct = web.buttons.matching(NSPredicate(format: "label ==[c] 'Correct'")).firstMatch
        XCTAssertTrue(correct.waitForExistence(timeout: 10), "Correct button")
        scrollTo(correct)
        correct.tap()
        let heading = web.descendants(matching: .staticText).matching(NSPredicate(format: "label CONTAINS[c] 'Correct '")).firstMatch
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "sheet heading")
        sleep(1)
        shot("back-sheet-open")

        // Safari's own Back button (in its toolbar), exactly what a person tapping Back does. The toolbar is
        // not part of the web view and its element type varies by iOS version, so search every descendant.
        let backQuery = NSPredicate(format: "label ==[c] 'Back' OR identifier ==[c] 'BackButton' OR identifier ==[c] 'Back'")
        let backButton = safari.descendants(matching: .any).matching(backQuery).firstMatch
        if !backButton.exists {
            // After scrolling, iOS 26 Safari minimizes its toolbar to the address pill, which draws no Back
            // button. Tapping the pill expands the toolbar again.
            safari.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.934)).tap()
            sleep(1)
            shot("back-toolbar-expanded")
        }
        if backButton.waitForExistence(timeout: 5) {
            backButton.tap()
            log("back: tapped Safari's Back control (type \(backButton.elementType.rawValue), id '\(backButton.identifier)')")
        } else {
            // The floating toolbar is not in the accessibility tree while the page is scrolled or a modal is up.
            // Tap where the compact toolbar draws its Back button (bottom-left, ~14% across and ~93% down on a
            // 6.3in iPhone, see the screenshot "back-sheet-open"). Logged, never silent.
            safari.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.142, dy: 0.934)).tap()
            log("back: Safari's Back control is not in the accessibility tree; tapped its position by coordinate")
        }
        sleep(2)
        shot("back-after")

        XCTAssertFalse(heading.exists, "the sheet closed")
        let consoleStillMounted = containing("End round 1", .button).waitForExistence(timeout: 10)
        XCTAssertTrue(consoleStillMounted, "the director console is still mounted: Back must not leave the route")
        log("back: sheet closed=\(!heading.exists), console mounted=\(consoleStillMounted)")
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
        var swipes = 0
        while !firstStat.isHittable && swipes < 40 { web.swipeUp(velocity: .slow); swipes += 1 }
        XCTAssertGreaterThan(swipes, 0, "the Compose rows were reached by scrolling, not already on screen at the top")
        sleep(1)
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
