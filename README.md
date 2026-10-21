# Across

An original Mac and Windows desktop app for sharing a keyboard, mouse, opt-in clipboard, and explicitly selected files over a local network.

**Engineering preview: Windows 0.1.6, Mac 0.1.6.** This update repairs input handoff timing, rejects stale capture events, uses unclamped Windows mouse movement, and removes the original cursor's center jump. Update both computers. This is independently implemented software, not a copy of CursorHop. No proprietary CursorHop code, assets, licenses, or subscription bypasses are included.

## Website

**[across on GitHub Pages](https://hrishikeshsriramoju.github.io/across/)** — free public hosting, with Mac and Windows downloads.

## Downloads

- [Download page](https://hrishikeshsriramoju.github.io/across/downloads/)
- [Mac — Apple Silicon DMG](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.6/Across-0.1.6-mac-arm64.dmg)
- [Windows — x64 ZIP](https://github.com/HrishikeshSriramoju/across/releases/download/v0.1.6/Across-0.1.6-win-x64.zip)
- [Windows update notes and checksum](https://github.com/HrishikeshSriramoju/across/releases/tag/v0.1.6)


The Mac preview is locally development-signed, not Apple Developer ID-signed or notarized. The Windows preview has no publisher certificate. Do not disable OS security protections. Only Apple Silicon Mac and x64 Windows packages are provided; Linux in the interactive web demo is illustrative, not a supported desktop package.

## Quick start

1. Install on both computers and use the same trusted local network.
2. On Mac, drag the complete Across app into Applications. Do not move its nested Across Input helper separately. On Windows, extract the entire ZIP and run Across.exe with its sibling files in place.
3. Host a workspace on the computer whose keyboard and mouse you want to share.
4. Connect from Nearby computers on the other, enter the host's code, and approve the request there. Pair once after updating both computers to 0.1.6 to establish remembered access.
5. Enable input on both computers and arrange the desk map. macOS needs the requested input permission and Local Network access; Windows may need Private-network firewall approval. Do not turn off the firewall.

**Ctrl+Alt+Esc** always returns control locally. Switch defaults to **Ctrl+Alt+Space**. Cursor lock defaults to **Ctrl+Alt+L**. On Mac, Alt means Option. Record your own combinations in Preferences.

Approved devices keep OS-encrypted credentials for local-network reconnection without another code. Both apps must be running, but their windows do not have to stay visible. In Windows 0.1.6, minimize or close the window to keep sharing in the tray; click the lime tray icon to reopen, and choose **Quit Across** there to exit. Update both computers to 0.1.6; saved pairings are retained. Enable input once to remember that choice across app restarts. See [updating and background testing](desktop/UPDATE_0.1.6.md). Use **Preferences → Remembered computers → Forget** to revoke access. Clipboard sharing remains off until enabled.

## Source layout

```text
desktop/   Electron app, Mac Swift helper, Windows PowerShell/C# helper, tests
website/   Website source: landing page, interactive concept demo, download page
docs/      Generated static website published by GitHub Pages
scripts/   Website publishing helper
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

The website is buildless HTML/CSS/JS. Edit `website/`, run `node scripts/publish-website.cjs`, and commit both `website/` and `docs/`. GitHub Pages publishes the `/docs` folder on `main` automatically. The `.nojekyll` marker serves the static files without a Jekyll build. Relative navigation works under the project path `/across/`. Installers remain in GitHub Releases, not the Pages site.

For local testing, serve the repository root with a static HTTP server and open `/docs/` and `/docs/downloads/`. The previous hosted site is left online as a fallback; the GitHub Pages URL above is now the primary address.

## Status and limitations

See [feature status](desktop/FEATURES.md), [setup details](desktop/README.md), and [0.1.6 update notes](desktop/UPDATE_0.1.6.md). 40 automated checks pass locally, with the Windows native compilation/layout test skipped on Mac, including Windows-mode background lifecycle tests with Electron test doubles, protocol, geometry, shortcut, native command-reader, and credential-store tests. Physical Windows minimized/hidden behavior, Mac-to-Windows input and real-machine restarts still need user testing; this is not an independently audited security product.

Native cross-computer file drag-and-drop, Windows sign-in/UAC secure desktop control, automatic app updating, and individual physical-monitor exclusions are not included. The website demo simulates actions and does not control your devices.

## License

Original source is MIT licensed; see [LICENSE](LICENSE). Electron and other dependencies retain their own licenses.
