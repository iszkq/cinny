import AppKit

// One geometric source generates the editable SVG and the opaque iOS icon.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\">"
func color(_ hex: String) -> NSColor {
    let n = UInt32(hex, radix: 16)!
    return NSColor(red: CGFloat((n >> 16) & 255)/255, green: CGFloat((n >> 8) & 255)/255,
                   blue: CGFloat(n & 255)/255, alpha: 1)
}
func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ fill: String) {
    color(fill).setFill()
    NSBezierPath(roundedRect: NSRect(x: x, y: 1024-y-h, width: w, height: h), xRadius: r, yRadius: r).fill()
    svg += "<rect x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(h)\" rx=\"\(r)\" fill=\"#\(fill)\"/>"
}
rect(0, 0, 1024, 1024, 0, "20242D")
rect(190, 116, 644, 792, 64, "ECEFF3")
rect(242, 170, 540, 170, 28, "BCCABC")
// A single zero on the display keeps the icon readable at small sizes.
rect(674, 204, 66, 102, 20, "35483B")
rect(691, 222, 32, 66, 7, "BCCABC")
for row in 0..<3 {
    for col in 0..<3 {
        rect(CGFloat(242 + col*190), CGFloat(392 + row*158), 160, 126, 25,
             col == 2 ? "F39839" : "56606E")
    }
}
rect(284, 447, 76, 16, 8, "FFFFFF")
rect(314, 417, 16, 76, 8, "FFFFFF")
rect(474, 447, 76, 16, 8, "FFFFFF")
rect(664, 447, 76, 16, 8, "FFFFFF")
rect(694, 419, 16, 16, 8, "FFFFFF")
rect(694, 475, 16, 16, 8, "FFFFFF")
for row in 1..<3 {
    for col in 0..<2 {
        rect(CGFloat(304 + col*190), CGFloat(436 + row*158), 36, 36, 18, "FFFFFF")
    }
}
rect(664, 595, 76, 16, 8, "FFFFFF")
rect(664, 625, 76, 16, 8, "FFFFFF")
rect(664, 753, 76, 16, 8, "FFFFFF")
rect(664, 783, 76, 16, 8, "FFFFFF")
svg += "</svg>\n"
NSGraphicsContext.restoreGraphicsState()
try svg.write(to: root.appendingPathComponent("public/res/calculator.svg"), atomically: true, encoding: .utf8)
let png = bitmap.representation(using: .png, properties: [:])!
try png.write(to: root.appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"))
// Render launcher sizes from the same geometric source for Android.
func androidIcon(_ size: Int, _ adaptive: Bool) -> Data {
    let output = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: output)
    let image = NSImage(size: NSSize(width: 1024, height: 1024))
    image.addRepresentation(bitmap)
    let inset = adaptive ? CGFloat(size) * 0.14 : 0
    image.draw(in: NSRect(x: inset,y:inset,width:CGFloat(size)-inset*2,height:CGFloat(size)-inset*2))
    NSGraphicsContext.restoreGraphicsState()
    return output.representation(using:.png,properties:[:])!
}
for (density, size, foregroundSize) in [("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)] {
    let directory = root.appendingPathComponent("android/app/src/main/res/mipmap-\(density)")
    for name in ["ic_launcher.png","ic_launcher_round.png"] { try androidIcon(size,false).write(to:directory.appendingPathComponent(name)) }
    try androidIcon(foregroundSize,true).write(to:directory.appendingPathComponent("ic_launcher_foreground.png"))
}
