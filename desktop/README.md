# Across desktop — personal engineering preview

Across is an independently written desktop app for sharing input and data between your Mac and Windows computers. It uses an original interface and protocol. No CursorHop code, keys, binaries, artwork or subscription logic are included.

Version 0.1.4 adds native-helper shortcut handling, modifier cleanup on handoff, recorded shortcuts for release/switch/cursor lock, and remembered pairing with automatic reconnection. Update both computers and pair once after updating to create remembered credentials. See [UPDATE_0.1.4.md](UPDATE_0.1.4.md). This is not a completed replacement for every CursorHop feature. The precise status is in [FEATURES.md](FEATURES.md).

## Install and pair

1. On an Apple Silicon Mac, open the Across Mac disk image and drag Across to Applications. The native helper requires macOS 13 or later; the packaged runtime must also support your installed OS. This build was launched on this development Mac only. Intel Mac is not packaged in this release.
2. On 64-bit Windows, extract the entire Windows ZIP into a folder. Run `Across.exe` from that folder. Keep its `resources` and other sibling files alongside it. Node.js and PowerShell packages do not need separate installation; Windows PowerShell 5.1 is used for the native helper.
3. Both computers must be on the same trusted local network. Use **Host workspace** on the computer whose keyboard and mouse you want to use.
4. Under **Nearby computers** on the other computer, click **Connect** beside the host. Enter the host's 16-character code (hyphens and case do not matter). Approve the request on the host within two minutes. Codes expire after ten minutes; **New code** rotates the code and invite without disconnecting paired computers. You can still copy a private `across://` invite into **Add another computer**. Keep codes and invites private.
5. On each computer, click **Enable input**. On Mac, the helper uses the native macOS permission prompt and waits up to 90 seconds for approval. Allow the app named in the prompt in System Settings → Privacy & Security → Device Control and Data Access (called Accessibility on older macOS). If needed, Preferences → Open macOS Accessibility settings also reveals `Across Input.app` in Finder so it can be selected or dragged into the permission list. Its location inside the main app is `Contents/Resources/native/Across Input.app`. A local development signature verifies the bundle identity; it is not Developer ID signing or notarization. After changing permission, retry Enable input if the wait has timed out.
6. Allow Across through Windows Firewall for a **Private network** if Windows asks, and allow **Local Network** access on Mac if asked. TCP 45876 carries the encrypted session; UDP 45877 discovers devices using subnet broadcasts, local multicast, and immediate query/reply. Both idle computers and available hosts appear; use **Refresh** to search immediately. Guest/client-isolated Wi-Fi, VPNs, and firewalls can block discovery even on the same Wi-Fi name. A custom TCP port can be set in Preferences before hosting. No router port forwarding is needed or recommended.
7. Drag the remote computer next to your local computer in the desk map. Edges snap when near each other. Move your mouse to a shared edge and hold briefly. You can also use **Ctrl+Alt+Space** to hop to the first ready client.
8. **Ctrl+Alt+Esc** returns control locally. The same shortcut is built into both native helpers and cannot be removed through preferences. The **Release input** button and tray menu also release control. Disconnecting releases held keys and buttons.

The Mac build is not Apple notarized, and the Windows build has no publisher certificate. Your operating system may require its normal explicit approval for a locally built app. This project does not modify Gatekeeper, Defender, UAC, firewall rules, or OS permission settings for you.

## Sharing

- Clipboard sharing is **off by default**. Enable it in Sharing on both computers. It synchronizes the latest clipboard while connected. It does not maintain a cloud clipboard history.
- Rich text uses HTML. Images use PNG. Individual clipboard types are limited to 375,000 bytes; the combined message is bounded to 900,000 characters. Large images and unsupported formats are skipped.
- Choose a connected computer and use **Choose file** to send a file up to 512 MB. The receiving computer must choose a destination before any file payload is sent. SHA-256 checks verify the completed transfer. Files are never opened automatically. A `.part` temporary file is removed on cancellation, disconnect, or clean app exit.
- File transfer uses the same encrypted connection as input, so large transfers may increase input latency. Native Finder/Explorer cross-computer dragging and file paste are not implemented.

## Customize

Preferences include computer name, four accent colors, TCP port, edge dwell, dead corners, pointer/scroll speed, scrolling direction, Command/Control translation, game/cursor lock, keyboard broadcast, inactive-host dimming, keep-awake, login startup, hotkeys and opt-in screen-lock synchronization. Save a named profile to retain the current settings and computer layout.

Game mode disables edge handoff and return. Use the hop shortcut to enter a remote computer, and the release shortcut to return. This is cursor confinement, not a specialized low-level game input driver.

The layout uses each computer's virtual desktop union. Monitor arrangement within a computer is provided by its OS; individual physical monitors cannot yet be positioned or excluded independently in Across. Mac/Windows display scaling can produce coordinate mismatches and needs two-computer validation.

Profiles are local and keyed by computer names, so assign distinct names to your computers. In 0.1.4, approved pairings are remembered with a private credential protected by Electron safeStorage (macOS Keychain / Windows DPAPI). Both apps must be running on a reachable local network. The previous host resumes hosting when auto-reconnect is enabled; a remembered client reconnects after discovery, without a new code or approval. Manual Disconnect pauses reconnection for the current run. Preferences → Remembered computers → Forget revokes access and disconnects the device. If you forget a device or replace its identity, forget the stale pairing on the other computer too before pairing again.

## Development

Requires Node.js 24+, npm and, for the Mac helper, Apple's command-line developer tools.

```sh
npm ci
npm run check
npm test
npm start
```

Rebuild the native helper on Mac:

```sh
node scripts/prepare-mac.cjs
```

Create packages:

```sh
npm run build:mac
npm run build:win
```

The Windows helper source is compiled by Windows PowerShell's `Add-Type` at application runtime. The Windows package can be produced on Mac because it has no compiled Node addons. Producing a ZIP is not proof of Windows runtime compatibility: hook installation, keyboard injection, scaling and desktop security behavior still require Windows testing.

The UI is in `src/index.html`, `src/style.css` and `src/renderer.js`. The native integration and desktop services are in `src/main.cjs`. TLS framing/pairing is in `src/link.cjs`; routing geometry is in `src/geometry.cjs`. The two independently written OS helpers are in `native/`.

## Privacy and connection design

All UI resources are local. The renderer has a restrictive content security policy, context isolation and sandboxing; it cannot access Node directly. IPC is limited to named actions from the main window. No telemetry or cloud account is used.

The host generates a private self-signed identity locally. Sessions use TLS 1.3. The client verifies the certificate fingerprint embedded in the invite before sending the temporary secret; the host then explicitly approves the computer. The trust guarantee depends on you sharing the correct private invite. This protocol is independent of CursorHop and uses TLS rather than Noise. The first release has not received an independent security audit.

Network identities and preferences are stored in Electron's user-data directory. On Mac it is normally `~/Library/Application Support/Across`; on Windows it is normally `%APPDATA%/Across`. Operating-system user access controls protect those files. Files are not stored in the source archive. Quitting ends the session and destroys the in-memory invite token.

The helpers observe pointer motion for edge detection while input is enabled. They forward key content only when a remote computer is active. Keyboard text is not written to diagnostic logs. Local hooks and injected events are marked to avoid echo loops; a heartbeat watchdog releases native suppression if the controlling process stops responding.

## Verified so far

- JavaScript syntax checks and the transport, geometry, discovery and nearby-pairing tests pass.
- TLS 1.3 handshake, message delivery, wrong certificate rejection, wrong secret rejection, host-declined pairing and adjacency routing were tested locally.
- A real Mac desktop window opened; hosting and explicit pairing with a harmless local protocol test peer succeeded.
- The Mac helper compiled for ARM64/macOS 13+, detected two physical displays with a negative origin, and failed closed while Accessibility was unavailable.
- The Windows ZIP contains an x64 Windows executable and native helper source. Windows runtime and physical Mac↔Windows input, clipboard and file transfer require the user's Windows computer.

See [RESEARCH.md](RESEARCH.md) for artifact evidence and [FEATURES.md](FEATURES.md) for the feature parity limits.
