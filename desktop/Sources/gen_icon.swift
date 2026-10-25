import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func color(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat = 1.0) -> CGColor {
    return CGColor(srgbRed: CGFloat(r) / 255.0, green: CGFloat(g) / 255.0, blue: CGFloat(b) / 255.0, alpha: a)
}

func makeIcon(_ size: Int) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!

    let scale = CGFloat(size) / 64.0
    ctx.translateBy(x: 0, y: CGFloat(size))
    ctx.scaleBy(x: 1, y: -1)
    ctx.scaleBy(x: scale, y: scale)
    ctx.setShouldAntialias(true)

    let background = CGPath(
        roundedRect: CGRect(x: 0, y: 0, width: 64, height: 64),
        cornerWidth: 15,
        cornerHeight: 15,
        transform: nil
    )
    ctx.addPath(background)
    ctx.setFillColor(color(0x0c, 0x0f, 0x0d))
    ctx.fillPath()

    let olive = color(0x9a, 0xdb, 0x37)

    let crown = CGMutablePath()
    crown.move(to: CGPoint(x: 18.5, y: 30.5))
    crown.addLine(to: CGPoint(x: 20.7, y: 21.9))
    crown.addLine(to: CGPoint(x: 26.9, y: 26.9))
    crown.addLine(to: CGPoint(x: 32.5, y: 18.7))
    crown.addLine(to: CGPoint(x: 38.1, y: 26.9))
    crown.addLine(to: CGPoint(x: 44.3, y: 21.9))
    crown.addLine(to: CGPoint(x: 46.5, y: 30.5))
    crown.closeSubpath()

    let body = CGMutablePath()
    body.move(to: CGPoint(x: 20.8, y: 30.5))
    body.addLine(to: CGPoint(x: 43.2, y: 30.5))
    body.addLine(to: CGPoint(x: 40.6, y: 46.7))
    body.addLine(to: CGPoint(x: 23.4, y: 46.7))
    body.closeSubpath()

    let base = CGMutablePath()
    base.move(to: CGPoint(x: 17.6, y: 55.5))
    base.addLine(to: CGPoint(x: 46.4, y: 55.5))
    base.addLine(to: CGPoint(x: 44.3, y: 46.7))
    base.addLine(to: CGPoint(x: 19.7, y: 46.7))
    base.closeSubpath()

    for path in [crown, body, base] {
        ctx.addPath(path)
        ctx.setFillColor(olive)
        ctx.fillPath()
    }

    let cross = CGMutablePath()
    cross.move(to: CGPoint(x: 32, y: 8.5))
    cross.addLine(to: CGPoint(x: 32, y: 19.5))
    cross.move(to: CGPoint(x: 26.5, y: 14))
    cross.addLine(to: CGPoint(x: 37.5, y: 14))
    ctx.addPath(cross)
    ctx.setStrokeColor(color(0xfc, 0x03, 0x77))
    ctx.setLineWidth(3.6)
    ctx.setLineCap(.round)
    ctx.strokePath()

    return ctx.makeImage()!
}

func writePNG(_ image: CGImage, to url: URL) {
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset")
try? FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let variants: [(String, Int)] = [
    ("icon_16x16", 16),
    ("icon_16x16@2x", 32),
    ("icon_32x32", 32),
    ("icon_32x32@2x", 64),
    ("icon_128x128", 128),
    ("icon_128x128@2x", 256),
    ("icon_256x256", 256),
    ("icon_256x256@2x", 512),
    ("icon_512x512", 512),
    ("icon_512x512@2x", 1024)
]

for (name, size) in variants {
    writePNG(makeIcon(size), to: outputDirectory.appendingPathComponent(name + ".png"))
}

print("已生成 \(variants.count) 张图标到 " + outputDirectory.path)
