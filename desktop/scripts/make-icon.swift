import AppKit
import Foundation
let folder = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    NSColor(calibratedRed: 0.86, green: 1, blue: 0.39, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: size, height: size), xRadius: CGFloat(size) * 0.22, yRadius: CGFloat(size) * 0.22).fill()
    let font = NSFont.systemFont(ofSize: CGFloat(size) * 0.73, weight: .semibold)
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(calibratedRed: 0.08, green: 0.1, blue: 0.07, alpha: 1)]
    let label = NSString(string: "A")
    let measured = label.size(withAttributes: attributes)
    label.draw(at: NSPoint(x: (CGFloat(size) - measured.width) / 2, y: (CGFloat(size) - measured.height) / 2), withAttributes: attributes)
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let data = bitmap.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: folder + "/icon_\(size)x\(size).png"))
}
