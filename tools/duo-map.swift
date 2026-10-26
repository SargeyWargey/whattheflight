// Renders the iPhone Duo section's map base (img/duo/map-dark.webp, map-light.webp) with
// MapKit, in the app's TrafficMap style: standard, flat, muted, no points of interest. Centred
// on the observer in js/duo.js, 96 × 96 miles at 14 pt a mile; js/duo.js expects 2,100 px across
// (MAP_PX_PER_MILE). From the Website folder:
//
//   swiftc -O tools/duo-map.swift -o /tmp/duo-map && /tmp/duo-map /tmp
//   for t in dark light; do cwebp -q 74 -resize 2100 0 /tmp/map-$t.png -o img/duo/map-$t.webp; done

import AppKit
import MapKit

let center = CLLocationCoordinate2D(latitude: 40.7580, longitude: -73.9855)
let miles = 96.0
let ptPerMile = 14.0
let metres = miles * 1609.344
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func snap(dark: Bool, done: @escaping () -> Void) {
    let options = MKMapSnapshotter.Options()
    options.region = MKCoordinateRegion(center: center, latitudinalMeters: metres, longitudinalMeters: metres)
    options.size = NSSize(width: miles * ptPerMile, height: miles * ptPerMile)
    let config = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
    config.pointOfInterestFilter = .excludingAll
    config.showsTraffic = false
    options.preferredConfiguration = config
    options.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
    MKMapSnapshotter(options: options).start { snapshot, error in
        guard let snapshot else { print("error", error as Any); exit(1) }
        let image = snapshot.image
        var rect = NSRect(origin: .zero, size: image.size)
        guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { exit(1) }
        let rep = NSBitmapImageRep(cgImage: cg)
        let data = rep.representation(using: .png, properties: [:])!
        let path = "\(out)/map-\(dark ? "dark" : "light").png"
        try! data.write(to: URL(fileURLWithPath: path))
        print(path, cg.width, cg.height)
        done()
    }
}

snap(dark: true) { snap(dark: false) { exit(0) } }
RunLoop.main.run(until: Date().addingTimeInterval(120))
print("timed out")
exit(1)
