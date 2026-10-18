import AppKit
import ApplicationServices
import Foundation
import Darwin

// Original Across input bridge. All mutable input state lives on the main run loop.
let marker: Int64 = 0x4143524f5353
let simulateInputState = CommandLine.arguments.contains("--test-input-state")
let outputLock = NSLock()
func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object), var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    outputLock.lock(); defer { outputLock.unlock() }
    FileHandle.standardOutput.write(Data(line.utf8))
}
let codes: [String: CGKeyCode] = [
    "KeyA":0,"KeyS":1,"KeyD":2,"KeyF":3,"KeyH":4,"KeyG":5,"KeyZ":6,"KeyX":7,"KeyC":8,"KeyV":9,
    "KeyB":11,"KeyQ":12,"KeyW":13,"KeyE":14,"KeyR":15,"KeyY":16,"KeyT":17,"Digit1":18,"Digit2":19,
    "Digit3":20,"Digit4":21,"Digit6":22,"Digit5":23,"Equal":24,"Digit9":25,"Digit7":26,"Minus":27,
    "Digit8":28,"Digit0":29,"BracketRight":30,"KeyO":31,"KeyU":32,"BracketLeft":33,"KeyI":34,"KeyP":35,
    "Enter":36,"KeyL":37,"KeyJ":38,"Quote":39,"KeyK":40,"Semicolon":41,"Backslash":42,"Comma":43,
    "Slash":44,"KeyN":45,"KeyM":46,"Period":47,"Tab":48,"Space":49,"Backquote":50,"Backspace":51,
    "Escape":53,"MetaRight":54,"MetaLeft":55,"ShiftLeft":56,"CapsLock":57,"AltLeft":58,"ControlLeft":59,
    "ShiftRight":60,"AltRight":61,"ControlRight":62,"NumpadDecimal":65,"NumpadMultiply":67,"NumpadAdd":69,
    "NumLock":71,"NumpadDivide":75,"NumpadEnter":76,"NumpadSubtract":78,"NumpadEqual":81,"Numpad0":82,
    "Numpad1":83,"Numpad2":84,"Numpad3":85,"Numpad4":86,"Numpad5":87,"Numpad6":88,"Numpad7":89,
    "Numpad8":91,"Numpad9":92,"F5":96,"F6":97,"F7":98,"F3":99,"F8":100,"F9":101,"F11":103,
    "F13":105,"F16":106,"F14":107,"F10":109,"F12":111,"F15":113,"Insert":114,"Home":115,
    "PageUp":116,"Delete":117,"F4":118,"End":119,"F2":120,"PageDown":121,"F1":122,
    "ArrowLeft":123,"ArrowRight":124,"ArrowDown":125,"ArrowUp":126,
    "F17":64,"F18":79,"F19":80,"F20":90
]
let names = Dictionary(uniqueKeysWithValues: codes.map { ($1, $0) })
func modifier(_ code: CGKeyCode) -> CGEventFlags? {
    switch code { case 54,55: return .maskCommand; case 56,60: return .maskShift; case 58,61: return .maskAlternate; case 59,62: return .maskControl; case 57: return .maskAlphaShift; default: return nil }
}
var remote = false
var cursorHidden = false
func restoreCursor() {
    if cursorHidden { CGDisplayShowCursor(CGMainDisplayID()); cursorHidden = false }
}
var lastHeartbeat = Date()
var capturedModifiers: Set<CGKeyCode> = []
var shortcutBindings: [[String:Any]] = []
var shortcutKeys: Set<CGKeyCode> = []
var quietModifiers: CGEventFlags = []
let standardModifiers: [CGKeyCode] = [54,55,56,58,59,60,61,62]
var injectedKeys: Set<CGKeyCode> = []
var injectedButtons: Set<Int> = []
var tap: CFMachPort?
let source = CGEventSource(stateID: .privateState)
func injectedFlags() -> CGEventFlags {
    var flags: CGEventFlags = []
    for code in injectedKeys { if let flag = modifier(code) { flags.insert(flag) } }
    return flags
}
func post(_ event: CGEvent?) {
    if simulateInputState { return }
    guard let event else { return }
    event.setIntegerValueField(.eventSourceUserData, value: marker)
    event.post(tap: .cghidEventTap)
}
func buttonSpec(_ index: Int, _ down: Bool) -> (CGMouseButton, CGEventType) {
    switch index { case 0: return (.left, down ? .leftMouseDown : .leftMouseUp); case 2: return (.right, down ? .rightMouseDown : .rightMouseUp); default: return (CGMouseButton(rawValue:UInt32(index == 1 ? 2 : index)) ?? .center, down ? .otherMouseDown : .otherMouseUp) }
}
func releaseAll() {
    remote = false
    restoreCursor()
    capturedModifiers.removeAll()
    // A shortcut can start locally and finish while capture is active. Balance
    // local modifier state so suppressed key-ups cannot leave Control/Alt held.
    for code in standardModifiers { let event = CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:false); event?.flags = []; post(event) }
    let keys = injectedKeys; injectedKeys.removeAll()
    for code in keys { let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false); event?.flags = []; post(event) }
    let buttons = injectedButtons; injectedButtons.removeAll()
    let location = CGEvent(source: nil)?.location ?? .zero
    for index in buttons { let (button, type) = buttonSpec(index, false); post(CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: location, mouseButton: button)) }
}
func number(_ object: [String: Any], _ key: String, limit: Double = 1_000_000) -> Double? {
    guard let value = object[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
    let result = value.doubleValue
    return result.isFinite && abs(result) <= limit ? result : nil
}
func bool(_ object: [String: Any], _ key: String) -> Bool? {
    guard let value = object[key] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }
    return value.boolValue
}
func handle(_ object: [String: Any]) {
    guard let op = object["op"] as? String else { return }
    switch op {
    case "shortcuts":
        if let bindings = object["bindings"] as? [[String:Any]], bindings.count <= 3 { shortcutBindings = bindings }
    case "heartbeat": lastHeartbeat = Date()
    case "remote":
        guard let enabled = bool(object, "enabled") else { return }
        releaseAll(); remote = enabled; lastHeartbeat = Date()
        if enabled && !simulateInputState {
            if CGDisplayHideCursor(CGMainDisplayID()) == .success { cursorHidden = true }
        }
        emit(["type":"control","remote":remote,"requestId":object["requestId"] as? Int ?? 0])
    case "release": releaseAll()
    case "quit": releaseAll(); exit(0)
    case "warp":
        if let x = number(object,"x"), let y = number(object,"y") { CGWarpMouseCursorPosition(CGPoint(x:x,y:y)) }
    case "inject":
        guard let event = object["event"] as? [String: Any], let type = event["type"] as? String else { return }
        switch type {
        case "move":
            guard let x = number(event,"x"), let y = number(event,"y") else { return }
            let activeButton = injectedButtons.contains(0) ? 0 : (injectedButtons.contains(2) ? 2 : (injectedButtons.sorted().first ?? 0))
            let mouseType: CGEventType = injectedButtons.isEmpty ? .mouseMoved : (activeButton == 0 ? .leftMouseDragged : (activeButton == 2 ? .rightMouseDragged : .otherMouseDragged))
            let (mouseButton, _) = buttonSpec(activeButton,true)
            post(CGEvent(mouseEventSource: source, mouseType: mouseType, mouseCursorPosition: CGPoint(x:x,y:y), mouseButton: mouseButton))
        case "key":
            guard let key = event["key"] as? String, let code = codes[key], let down = bool(event,"down") else { return }
            if down { injectedKeys.insert(code) } else { injectedKeys.remove(code) }
            let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down); e?.flags = injectedFlags(); post(e)
        case "button":
            guard let indexValue = number(event,"button",limit:4), indexValue.rounded() == indexValue, indexValue >= 0, let down = bool(event,"down") else { return }
            let index = Int(indexValue)
            if down { injectedButtons.insert(index) } else { injectedButtons.remove(index) }
            let (button,type) = buttonSpec(index,down)
            let e = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: CGEvent(source:nil)?.location ?? .zero, mouseButton: button); e?.flags = injectedFlags(); post(e)
        case "scroll":
            guard let dx = number(event,"dx",limit:10000), let dy = number(event,"dy",limit:10000) else { return }
            post(CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 2, wheel1: Int32(dy.rounded()), wheel2: Int32(dx.rounded()), wheel3: 0))
        default: break
        }
    default: break
    }
}
let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        releaseAll(); emit(["type":"panic","reason":"event-tap-disabled"])
        if let tap { CGEvent.tapEnable(tap:tap, enable:true) }
        return Unmanaged.passUnretained(event)
    }
    if event.getIntegerValueField(.eventSourceUserData) == marker { return Unmanaged.passUnretained(event) }
    if remote && Date().timeIntervalSince(lastHeartbeat) > 2 { releaseAll(); emit(["type":"panic","reason":"heartbeat-timeout"]) }
    let code = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
    let keyboard = type == .keyDown || type == .keyUp || type == .flagsChanged
    let physicalFlags = event.flags
    if type == .keyUp && shortcutKeys.remove(code) != nil { return nil }
    if type == .keyDown {
        if shortcutKeys.contains(code) { return nil }
        let modifiers = [("Control",CGEventFlags.maskControl),("Alt",CGEventFlags.maskAlternate),("Shift",CGEventFlags.maskShift),("Meta",CGEventFlags.maskCommand)].filter { physicalFlags.contains($0.1) }.map { $0.0 }
        if let key = names[code], let binding = shortcutBindings.first(where: { ($0["key"] as? String) == key && Set($0["modifiers"] as? [String] ?? []) == Set(modifiers) }), let action = binding["action"] as? String {
            shortcutKeys.insert(code); quietModifiers.formUnion(physicalFlags.intersection([.maskControl,.maskAlternate,.maskShift,.maskCommand]))
            if remote { for held in capturedModifiers { if let name = names[held] { emit(["type":"key","key":name,"down":false]) } }; capturedModifiers.removeAll() }
            for held in standardModifiers { let e = CGEvent(keyboardEventSource:source,virtualKey:held,keyDown:false); e?.flags = []; post(e) }
            emit(["type":"shortcut","action":action]); return nil
        }
    }
    if keyboard {
        let previousQuiet = quietModifiers; quietModifiers.formIntersection(physicalFlags)
        if type == .flagsChanged, let flag = modifier(code), previousQuiet.contains(flag) { return nil }
        event.flags.subtract(quietModifiers)
    }
    if remote && type == .keyDown && code == 53 && event.flags.contains([.maskControl,.maskAlternate]) {
        quietModifiers.formUnion([.maskControl,.maskAlternate]);shortcutKeys.insert(code);releaseAll(); emit(["type":"panic"]); return nil
    }
    let movement = type == .mouseMoved || type == .leftMouseDragged || type == .rightMouseDragged || type == .otherMouseDragged
    if movement {
        emit(["type":"move","x":event.location.x,"y":event.location.y,"dx":event.getDoubleValueField(.mouseEventDeltaX),"dy":event.getDoubleValueField(.mouseEventDeltaY)])
    } else if remote {
        switch type {
        case .keyDown,.keyUp:
            if let key = names[code] { emit(["type":"key","key":key,"down":type == .keyDown]) }
        case .flagsChanged:
            if let key = names[code], let flag = modifier(code) {
                let down = event.flags.contains(flag) && !capturedModifiers.contains(code)
                if down { capturedModifiers.insert(code) } else { capturedModifiers.remove(code) }
                emit(["type":"key","key":key,"down":down])
            }
        case .leftMouseDown,.leftMouseUp,.rightMouseDown,.rightMouseUp,.otherMouseDown,.otherMouseUp:
            let nativeButton = Int(event.getIntegerValueField(.mouseEventButtonNumber))
            let button = (type == .leftMouseDown || type == .leftMouseUp) ? 0 : ((type == .rightMouseDown || type == .rightMouseUp) ? 2 : (nativeButton == 2 ? 1 : nativeButton))
            emit(["type":"button","button":button,"down":type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown])
        case .scrollWheel:
            emit(["type":"scroll","dx":event.getDoubleValueField(.scrollWheelEventDeltaAxis2),"dy":event.getDoubleValueField(.scrollWheelEventDeltaAxis1)])
        default: break
        }
    }
    return remote ? nil : Unmanaged.passUnretained(event)
}
// Foundation read(upToCount:) may wait for a full buffer on a pipe. Use POSIX
// read so small handoff, heartbeat, and release frames are handled immediately.
func readCommands(_ deliver: ([String:Any]) -> Void) -> Bool {
    var frame = Data()
    var buffer = [UInt8](repeating:0,count:4096)
    while true {
        let count = buffer.withUnsafeMutableBytes { Darwin.read(STDIN_FILENO,$0.baseAddress,$0.count) }
        if count == 0 { return true }
        if count < 0 { if errno == EINTR { continue }; return false }
        for byte in buffer.prefix(count) {
            if byte == 10 {
                if let object = try? JSONSerialization.jsonObject(with:frame) as? [String:Any] { deliver(object) }
                frame.removeAll(keepingCapacity:true)
            } else {
                if frame.count >= 65536 { return false }
                frame.append(byte)
            }
        }
    }
}
// Regression probe uses the production command reader but never installs an
// event tap, changes cursor state, or asks for input permissions.
if CommandLine.arguments.contains("--test-command-stream") {
    let ok = readCommands { object in emit(["type":"command-received","op":object["op"] as? String ?? "unknown"]) }
    exit(ok ? 0 : 4)
}
if simulateInputState {
    let ok = readCommands { object in
        if object["op"] as? String == "test-key", let name = object["key"] as? String, let code = codes[name] {
            let down = object["down"] as? Bool ?? true
            let type: CGEventType = modifier(code) != nil ? .flagsChanged : (down ? .keyDown : .keyUp)
            if let event = CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:down) {
                event.type = type;event.flags = []
                for flag in object["modifiers"] as? [String] ?? [] { switch flag { case "Control":event.flags.insert(.maskControl);case "Alt":event.flags.insert(.maskAlternate);case "Shift":event.flags.insert(.maskShift);case "Meta":event.flags.insert(.maskCommand);default:break } }
                let result = callback(OpaquePointer(bitPattern:1)!,type,event,nil)
                emit(["type":"test-disposition","key":name,"down":down,"suppressed":result == nil])
            }
        } else { handle(object) }
    }
    exit(ok ? 0 : 4)
}
var displayCount: UInt32 = 0
CGGetActiveDisplayList(0,nil,&displayCount)
var displays = [CGDirectDisplayID](repeating:0,count:Int(displayCount))
CGGetActiveDisplayList(displayCount,&displays,&displayCount)
let bounds = displays.prefix(Int(displayCount)).reduce(CGRect.null) { $0.union(CGDisplayBounds($1)) }
var trusted = AXIsProcessTrusted()
let displayInfo: [[String:Any]] = displays.prefix(Int(displayCount)).map { id in
    let rect = CGDisplayBounds(id)
    return ["id":id,"x":rect.origin.x,"y":rect.origin.y,"width":rect.width,"height":rect.height]
}
func emitReady(_ allowed: Bool) {
    emit(["type":"ready","trusted":allowed,"shortcuts":true,"platform":"darwin","bounds":["x":bounds.origin.x,"y":bounds.origin.y,"width":bounds.width,"height":bounds.height],"displays":displayInfo,"bundle":Bundle.main.bundleIdentifier ?? "unbundled","postAllowed":CGPreflightPostEventAccess(),"listenAllowed":CGPreflightListenEventAccess()])
}
if CommandLine.arguments.contains("--check") { emitReady(trusted); exit(0) }
if !trusted && CommandLine.arguments.contains("--request-access") {
    NSApplication.shared.setActivationPolicy(.accessory)
    emitReady(false)
    emit(["type":"permission","message":"Approve Across or Across Input in System Settings. Waiting for permission…","bundlePath":Bundle.main.bundlePath])
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    trusted = AXIsProcessTrustedWithOptions(options)
    let deadline = Date().addingTimeInterval(90)
    while !trusted && Date() < deadline {
        RunLoop.current.run(until:Date().addingTimeInterval(0.5))
        trusted = AXIsProcessTrusted()
    }
}
guard trusted else { emitReady(false); emit(["type":"error","message":"Input permission is still missing. Add Across Input.app in Device Control and Data Access, then retry Enable input."]); exit(2) }
let types: [CGEventType] = [.mouseMoved,.leftMouseDragged,.rightMouseDragged,.otherMouseDragged,.keyDown,.keyUp,.flagsChanged,.leftMouseDown,.leftMouseUp,.rightMouseDown,.rightMouseUp,.otherMouseDown,.otherMouseUp,.scrollWheel]
let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
tap = CGEvent.tapCreate(tap:.cgSessionEventTap, place:.headInsertEventTap, options:.defaultTap, eventsOfInterest:mask, callback:callback, userInfo:nil)
guard let eventTap = tap else { emit(["type":"error","message":"Input capture unavailable. Check Accessibility and Input Monitoring permissions."]); exit(3) }
let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault,eventTap,0)
CFRunLoopAddSource(CFRunLoopGetMain(),runLoopSource,.commonModes)
CGEvent.tapEnable(tap:eventTap,enable:true)
emitReady(true)
let watchdog = Timer.scheduledTimer(withTimeInterval:0.2,repeats:true) { _ in
    if remote && Date().timeIntervalSince(lastHeartbeat) > 2 { releaseAll(); emit(["type":"panic","reason":"heartbeat-timeout"]) }
}
RunLoop.main.add(watchdog,forMode:.common)
signal(SIGINT,SIG_IGN); signal(SIGTERM,SIG_IGN)
let sigint = DispatchSource.makeSignalSource(signal:SIGINT,queue:.main)
let sigterm = DispatchSource.makeSignalSource(signal:SIGTERM,queue:.main)
for signalSource in [sigint,sigterm] { signalSource.setEventHandler { releaseAll(); exit(0) }; signalSource.resume() }
DispatchQueue.global(qos:.userInitiated).async {
    let ok = readCommands { object in DispatchQueue.main.async { handle(object) } }
    DispatchQueue.main.async { releaseAll(); exit(ok ? 0 : 4) }
}
CFRunLoopRun()
releaseAll()
