# Across 0.1.6 — input handoff repair (Mac and Windows)

Update **both computers**. Saved pairings and preferences are retained. Older versions can connect, but they do not contain the Windows capture and movement fixes.

- Windows no longer moves the original cursor to the center when sharing starts. It stays at its departure point.
- Windows raw mouse motion is used during capture, independent of the local cursor reaching a screen edge. This avoids a clamped OS pointer starving remote movement; raw motion can feel different from Windows pointer acceleration, so adjust Across pointer speed if needed.
- Both helpers acknowledge capture. Input is forwarded only after acknowledgement, and native frames carry capture-generation IDs so old movement/clicks cannot be reused after switching screens.
- A short 180 ms return-edge guard avoids an immediate bounce back across the boundary. It does not accumulate overshoot when pushing against a wall.
- Windows hook callbacks no longer write synchronously to stdout. A bounded asynchronous queue keeps slow pipe writes out of the low-level input hooks. Overflow returns control locally.
- Stopping or losing an input helper advertises input-off to the peer; a host releases capture when its receiver loses input readiness.
- Enable input once after installing. That choice is now remembered across app restarts. Stop input turns automatic helper startup off. OS permission checks remain required.

## Install

On Windows, quit Across through the tray menu, extract the whole ZIP into a fresh folder and run Across.exe. Keep all sibling files.

On Mac, quit Across and replace the entire app in Applications. Do not move its nested Across Input helper out. Enable input; if macOS asks for permission or Keychain access, handle the prompt normally. This engineering preview is locally signed, not notarized; do not disable system security protections.

Reconnect, enable input on both computers, and check that the desk map matches the physical layout. The Mac display size is refreshed from its native helper when input starts; pairing alone does not enable input.

## Verification and remaining limits

Automated regressions exercise capture acknowledgements on both platform modes, stale frame rejection, repeated return/entry, helper readiness changes, tray background lifetime, native Mac click suppression, protocol and trust persistence. Windows helper compilation/layout has a non-injecting `-SelfTest` mode and a Windows-only automated test. That test is skipped on this Mac; Windows raw input, real mouse-hook lifetime and physical two-computer behavior must still be tested on Windows. Do not treat source checks or a successful ZIP build as a Windows runtime test.

For a physical check, test Windows → Mac → Windows at least ten times with movement, typing and clicks, including each shared edge. While controlling the Mac, verify clicks do not activate the Windows desktop. Push against an unshared edge, then reverse: it should move immediately without accumulated overshoot. Confirm the original Windows cursor does not jump to the center. Ctrl+Alt+Esc always releases input.
