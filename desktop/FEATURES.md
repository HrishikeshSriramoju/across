# Feature parity and verification ledger

Reference: public CursorHop features/help/changelog through 0.12.1 and supplied DMG package identity. Public claims are not treated as proof of behavior in that DMG. A setting is counted only when there is implementation behind it.

| Feature | Across 0.1.0 implementation | Verification / remaining work |
| --- | --- | --- |
| Standalone Mac desktop app | Packaged Apple Silicon `.app` with Swift native input helper | Launch and permission-denied path checked; Accessibility needed for capture/injection |
| Standalone Windows desktop app | Packaged x64 `Across.exe` plus PowerShell/C# Win32 helper | ZIP built; Windows runtime not available on development host |
| Host on Mac or Windows | Same desktop services and protocol on both | Mac hosting verified; Windows host pending physical test |
| Native mouse/keyboard relay | CGEventTap/CGEvent on Mac; low-level hooks/SendInput on Windows | Implemented, live two-machine test pending |
| Mac-host exclusive capture (0.1.3) | Immediate bounded pipe commands, native capture acknowledgement before forwarding, source cursor hide/restore | Native command-reader and capture-gate regressions pass; physical Mac-to-Windows clicking still needs retest |
| Buttons, scrolling, numpad/function keys | Native physical key mappings, five mouse buttons, two-axis wheel | Implemented; international/IME/media/hardware macro completeness pending |
| Command ↔ Control translation | Per-recipient modifier translation | Implemented, pending live cross-platform test |
| Screen edge handoff | Adjacency, overlap, dwell, dead corners and pointer speed | Geometry tested; live behavior pending |
| Display map | Draggable snapped computer virtual-desktop unions, local persistence | UI verified; physical monitor identity/exclusions/individual Hop Keys missing |
| Multiple computers | Up to ten authenticated clients per host | Two local protocol peers tested; ten-computer load not tested |
| LAN discovery (0.1.2) | Idle device and host listing, multicast + per-subnet UDP announcements, query/reply refresh, Connect button and private code pairing | Validation and local TLS code pairing tested; physical Mac/Windows and firewall behavior still need user testing |
| Encryption | TLS 1.3 with pinned certificate and 256-bit invite secret | Transport tests pass; independent security review pending |
| Pairing approval (0.1.2) | Private invite or 16-character random code with TLS-bound mutual proof, plus foreground host approval dialog | Code/rotation/decline tests added; no broadcast secrets or automatic approval |
| Clipboard text | Opt-in latest-value synchronization in both directions | Async runtime API implemented; physical pair test pending |
| Clipboard images/rich formatting | PNG and HTML with bounded payload sizes | Implemented; physical pair test pending; RTF/file clipboard missing |
| File sending | Explicit sender choice, receiver Save dialog, SHA-256 integrity | Implemented; physical pair test pending; 512 MB cap |
| File cancellation | Cancel outgoing, decline incoming and partial-file cleanup | Implemented; pause/resume and streamed progress UI missing |
| OS-native file drag/drop and paste | Not implemented | Requires native file promise/OLE and destination integration |
| Native shortcuts and recording (0.1.4) | Press-to-record Release/Switch/Cursor lock; native shortcut dispatch, duplicate validation, modifier cleanup | Parser, recorder and repeated native-state tests pass; physical Windows testing required |
| Remembered computers (0.1.4) | OS-encrypted device credentials, pinned TLS mutual reconnect, auto-host/discovery reconnect, Forget device | Restart/reconnect/revocation and encrypted-store adapter tests pass; real two-computer restart test required |
| Named profiles | Local settings and computer layouts | Implemented |
| Keyboard groups | Broadcast keyboard to connected clients | Implemented; physical keyboard selection and per-group mappings missing |
| Game mode / cursor lock | Prevents edge exit; explicit release/hop hotkeys | Implemented; raw game input and game-specific compatibility untested |
| Release recovery | Native Ctrl+Alt+Esc, configurable app chord, tray/button, helper watchdog, disconnect key-up cleanup | Non-input paths tested; actual stuck-key recovery needs live test |
| Screen dimming | Click-through host overlays while remotely active | Implemented; automatic inactive-client dimming not implemented |
| Always awake | Display-sleep blocker while connected | Implemented |
| Power/session sync | Opt-in lock event propagation; suspend returns control locally | Mac lock command depends on OS support; unlock/sleep/restart/shutdown sync missing |
| Tray and startup | Tray controls, quit/release/disconnect, opt-in login startup | Implemented; Windows shell behavior unverified |
| Per-device tuning | Global input tuning only | Individual per-device presets, turbo Wi-Fi, hardware modes missing |
| Windows sign-in/UAC and Ctrl+Alt+Del | Not implemented | Requires signed privileged Windows service/secure-desktop integration |
| Auto reconnect and remote takeover | Re-pair manually | Not implemented |
| Updates and rollback | Manual packages | Not implemented; signing/notarization certificates needed for distribution |
| Licensing | Original MIT source; no subscription gates | No CursorHop license checks or entitlements reused |

Sources: [features](https://cursorhop.com/features/), [keyboard](https://cursorhop.com/features/keyboard-sharing/), [layout](https://cursorhop.com/features/layout-editor/), [clipboard](https://cursorhop.com/features/clipboard-sharing/), [files](https://cursorhop.com/features/file-transfer/), [settings](https://cursorhop.com/features/device-settings/), [cursor lock](https://cursorhop.com/features/cursor-lock/), [power sync](https://cursorhop.com/features/power-sync/), [changelog](https://cursorhop.com/changelog/), [help](https://cursorhop.com/help/).
