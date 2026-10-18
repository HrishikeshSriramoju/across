# Across

An original Mac and Windows desktop app for sharing a keyboard, mouse, opt-in clipboard, and explicitly selected files over a local network.

**Engineering preview: Windows 0.1.5, Mac 0.1.4.** The Windows maintenance update keeps sharing running while minimized or closed to the tray. This is independently implemented software, not a copy of CursorHop. No proprietary CursorHop code, assets, licenses, or subscription bypasses are included.

## Downloads

- [Download page](https://across-device-workspace.gentlecream6.chatgpt.site/downloads/)
- [Mac — Apple Silicon DMG](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.4/Across-0.1.4-mac-arm64.dmg)
- [Windows — x64 ZIP](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.5/Across-0.1.5-win-x64.zip)
- [Windows update notes and checksum](https://github.com/HrishikeshSriramoju/across/releases/tag/v0.1.5)
- [Mac release and checksums](https://github.com/HrishikeshSriramoju/across/releases/tag/v0.1.4)

No ChatGPT login or subscription is required to visit the website or download the apps.

The Mac preview is locally development-signed, not Apple Developer ID-signed or notarized. The Windows preview has no publisher certificate. Do not disable OS security protections. Only Apple Silicon Mac and x64 Windows packages are provided; Linux in the interactive web demo is illustrative, not a supported desktop package.

## Quick start

1. Install on both computers and use the same trusted local network.
2. On Mac, drag the complete Across app into Applications. Do not move its nested Across Input helper separately. On Windows, extract the entire ZIP and run Across.exe with its sibling files in place.
3. Host a workspace on the computer whose keyboard and mouse you want to share.
4. Connect from Nearby computers on the other, enter the host's code, and approve the request there. Pair once after updating both computers to 0.1.4 to establish remembered access.
5. Enable input on both computers and arrange the desk map. macOS needs the requested input permission and Local Network access; Windows may need Private-network firewall approval. Do not turn off the firewall.

**Ctrl+Alt+Esc** always returns control locally. Switch defaults to **Ctrl+Alt+Space**. Cursor lock defaults to **Ctrl+Alt+L**. On Mac, Alt means Option. Record your own combinations in Preferences.

Approved devices keep OS-encrypted credentials for local-network reconnection without another code. Both apps must be running, but their windows do not have to stay visible. In Windows 0.1.5, minimize or close the window to keep sharing in the tray; click the lime tray icon to reopen, and choose **Quit Across** there to exit. Existing Mac 0.1.4 is compatible; saved pairings are retained. See [updating and background testing](desktop/UPDATE_0.1.5.md). Use **Preferences → Remembered computers → Forget** to revoke access. Clipboard sharing remains off until enabled.

## Source layout

```text
desktop/   Electron app, Mac Swift helper, Windows PowerShell/C# helper, tests
website/   Public landing page, interactive concept demo, download page
```

Local preferences, device identities, remembered credentials, build dependencies, and personal files are deliberately not included. Installers live in Releases rather than Git history.

## Build and test

Requires Node.js 24+ and npm. Mac builds require Apple's command-line developer tools. Windows uses Windows PowerShell 5.1 for its native helper.

```sh
cd desktop
npm ci
npm run check
npm test
npm start
```

On Mac, `npm run build:mac` compiles and packages the native helper. `npm run build:win` creates the Windows x64 ZIP; producing a package on Mac does not verify Windows runtime behavior. Native Mac regression tests are skipped when their compiled helper is absent.

The website is buildless HTML/CSS/JS. Serve `website/` with a static HTTP server. The hosted Sites deployment is managed separately.

## Status and limitations

See [feature status](desktop/FEATURES.md), [setup details](desktop/README.md), and [0.1.5 update notes](desktop/UPDATE_0.1.5.md). All 32 automated checks pass locally, including Windows-mode background lifecycle tests with Electron test doubles, protocol, geometry, shortcut, native command-reader, and credential-store tests. Physical Windows minimized/hidden behavior, Mac-to-Windows input and real-machine restarts still need user testing; this is not an independently audited security product.

Native cross-computer file drag-and-drop, Windows sign-in/UAC secure desktop control, automatic app updating, and individual physical-monitor exclusions are not included. The website demo simulates actions and does not control your devices.

## License

Original source is MIT licensed; see [LICENSE](LICENSE). Electron and other dependencies retain their own licenses.
