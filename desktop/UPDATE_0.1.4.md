# Across 0.1.4 — keyboard, shortcuts, remembered computers

Update both Mac and Windows, then pair once with the code and approve on the host. Existing 0.1.3 pairings did not store long-term credentials, so that one new pairing is required.

## Keyboard handoff

Configured shortcuts are recognized by the native input helper, including while controlling another computer. Shortcut modifier key-ups are balanced locally and remotely, and edge dwell is reset on return. The helper consumes the shortcut key itself and cleans up its held modifiers instead of forwarding the shortcut as typing. Native capture is still acknowledged before remote input begins; the two-second heartbeat watchdog and Ctrl+Alt+Esc remain available.

The Mac cursor is hidden during capture and restored on return. A simulated native regression test repeatedly enters remote mode, triggers the switch shortcut, releases modifiers, types locally, re-enters remote mode and types remotely. It never posts real input or changes cursor state. Physical Mac/Windows behavior still needs user testing, especially with elevated Windows applications and non-US keyboard layouts.

## Record shortcuts

In Preferences, click **Record** for Return to this computer, Switch computer, or Toggle cursor lock. Press a chord and release all keys; choose **Save preferences**. Escape cancels. Include Control, Option/Alt, or Command/Windows. Duplicate bindings and reuse of Ctrl+Alt+Esc for another action are rejected. Recording temporarily releases remote capture and suspends configured app shortcuts, with an automatic timeout and cancellation on focus loss.

Defaults: Return = Ctrl+Alt+Esc; Switch = Ctrl+Alt+Space; Cursor lock = Ctrl+Alt+L. On Mac, Alt means Option. OS-reserved shortcuts may still be intercepted by the operating system. Recording does not save keyboard content or request new OS permissions.

## Pair once, reconnect later

An approved first pairing exchanges a new 256-bit private credential through the encrypted connection. Credentials are stored using Electron safeStorage and never appear in discovery broadcasts or renderer state. There is no plaintext persistence fallback if OS credential protection is unavailable. Later reconnection pins the remembered host certificate and mutually verifies fresh TLS-bound HMAC proofs; changing a device name or spoofing discovery is not enough to gain access.

Keep both apps open on the same reachable network. With auto-reconnect enabled, the previous host resumes listening after restart, and remembered clients reconnect after discovery. Manual Disconnect pauses reconnection for this app run. Input still needs Enable input and the OS permissions; clipboard remains opt-in. A paired device can reconnect without another host approval, so only approve computers you trust.

Use Preferences → Remembered computers → Forget to revoke saved access and disconnect that device. Forget stale entries on both sides before pairing afresh after revocation/reinstallation. Your existing preferences and layout are preserved.

The Mac app is locally development-signed rather than Developer ID/notarized; updating can require refreshing Across's permission entry. Do not move its nested Across Input.app out of the installed app.
