# Across

An original Mac and Windows desktop app for sharing a keyboard, mouse, opt-in clipboard, and explicitly selected files over a local network.

**Engineering preview, version 0.1.4.** This is independently implemented software, not a copy of CursorHop. No proprietary CursorHop code, assets, licenses, or subscription bypasses are included.

## Downloads

- [Download page](https://across-device-workspace.gentlecream6.chatgpt.site/downloads/)
- [Mac — Apple Silicon DMG](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.4/Across-0.1.4-mac-arm64.dmg)
- [Windows — x64 ZIP](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.4/Across-0.1.4-win-x64.zip)
- [Release notes and checksums](https://github.com/HrishikeshSriramoju/across/releases/tag/v0.1.4)

No ChatGPT login or subscription is required to visit the website or download the apps.

The Mac preview is locally development-signed, not Apple Developer ID-signed or notarized. The Windows preview has no publisher certificate. Do not disable OS security protections. Only Apple Silicon Mac and x64 Windows packages are provided; Linux in the interactive web demo is illustrative, not a supported desktop package.

## Quick start

1. Install on both computers and use the same trusted local network.
2. On Mac, drag the complete Across app into Applications. Do not move its nested Across Input helper separately. On Windows, extract the entire ZIP and run Across.exe with its sibling files in place.
3. Host a workspace on the computer whose keyboard and mouse you want to share.
4. Connect from Nearby computers on the other, enter the host's code, and approve the request there. Pair once after updating both computers to 0.1.4 to establish remembered access.
5. Enable input on both computers and arrange the desk map. macOS needs the requested input permission and Local Network access; Windows may need Private-network firewall approval. Do not turn off the firewall.

**Ctrl+Alt+Esc** always returns control locally. Switch defaults to **Ctrl+Alt+Space**. Cursor lock defaults to **Ctrl+Alt+L**. On Mac, Alt means Option. Record your own combinations in Preferences.

Approved devices keep OS-encrypted credentials for local-network reconnection without another code. Both apps must be running. Use **Preferences → Remembered computers → Forget** to revoke access. Clipboard sharing remains off until enabled.

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

See [feature status](desktop/FEATURES.md), [setup details](desktop/README.md), and [0.1.4 update notes](desktop/UPDATE_0.1.4.md). Automated protocol, geometry, shortcut, native command-reader, and credential-store tests pass locally. Physical Mac-to-Windows input and real-machine restarts still need user testing; this is not an independently audited security product.

Native cross-computer file drag-and-drop, Windows sign-in/UAC secure desktop control, automatic app updating, and individual physical-monitor exclusions are not included. The website demo simulates actions and does not control your devices.

## License

Original source is MIT licensed; see [LICENSE](LICENSE). Electron and other dependencies retain their own licenses.
