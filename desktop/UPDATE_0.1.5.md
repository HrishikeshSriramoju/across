# Across 0.1.5 — Windows background sharing

Windows-only maintenance package; compatible with the existing Mac 0.1.4 app and saved device pairings.

- Closing the window keeps Across running in the notification area. Minimizing does not stop sharing.
- A real native bitmap replaces the unsupported SVG tray image. Click the lime Across tray icon (possibly under the taskbar's hidden-icons arrow) to reopen the window.
- Reopening restores minimized windows. Launching Across again opens the existing instance instead of starting a conflicting second helper.
- Disable window background throttling and request system activity while input or a connection is active. The screen may still turn off unless Keep displays awake is enabled. Sleep, lid-close, sign-out, secure desktops, and quitting are not bypassed.
- Use **Quit Across** in the tray menu to stop sharing and exit. Release input and Disconnect remain available there.

## Updating

1. On Windows, right-click the old Across tray icon and choose Quit Across. If an older invisible instance has no usable tray icon, end only Across.exe in Task Manager before updating.
2. Extract the complete 0.1.5 ZIP into a new folder. Do not run it inside the ZIP or mix files from old versions.
3. Run Across.exe, reconnect to your remembered computer, and enable input. The Mac can stay on 0.1.4. Saved settings are retained.
4. Test keys, clicks and pointer movement with the Windows window visible, minimized, and closed to the tray. Then reopen it from the tray. Quit Across should disconnect.

## Verification

Automated Windows-mode lifecycle tests exercise the real main-process handlers using Electron test doubles: input forwarding and native heartbeats survive minimize/hide; tray and second-instance restore work; explicit Quit releases input and closes the link; power protection is cleaned up. Existing protocol, trust, geometry, shortcut and native-stream regressions also run. The ZIP is cross-built on Mac; physical Windows background behavior still needs testing on a Windows computer.

The Windows preview is unsigned. Do not disable Windows security protections.
