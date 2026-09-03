Created At: 2026-08-07T18:48:59-04:00
Completed At: 2026-08-07T18:48:59-04:00
# Attach Maps to Google Maps (Satellite & Hybrid)

This plan integrates Google Maps imagery directly into the Leaflet mapping interfaces in `admin.html` and `driver.html`. It switches the default map style to **Google Hybrid** (Satellite photo with street/boundary labels) for high-precision cemetery plot navigation, and adds direct Google Maps external navigation links to coordinates in popups.

## Proposed Changes

### Admin Command Center Map
---

#### [MODIFY] [admin.html](file:///Users/jccoffey/Downloads/GAS/GraveFlow/admin.html)
- Update `initMap` to load **Google Hybrid**, **Google Satellite**, **Google Roadmap**, and **OpenStreetMap** tile layers.
- Set **Google Hybrid** as the default tile layer.
- Add a Layer Switcher control (`L.control.layers`) to allow manual toggling between these styles.
- Add a clickable "Open in Google Maps" link in each active gig marker popup.

### Driver PWA Map
---

#### [MODIFY] [driver.html](file:///Users/jccoffey/Downloads/GAS/GraveFlow/driver.html)
- Update driver map initialization to use the **Google Hybrid** tile layer by default.
- In the active gig target grave popup, add a direct hyperlink to open/navigate to the coordinates in Google Maps:
  `https://www.google.com/maps/search/?api=1&query=lat,lon`

## Verification Plan

### Manual Verification
1. Log into the Admin Dashboard (`admin.html`) as `admin@graveflow.com` and verify that the map initializes with a Google Satellite Hybrid view and features a layer selector in the top-right corner.
2. Click any gig pin on the map and click the coordinate link in the popup to ensure it correctly opens Google Maps in a new tab.
3. Log into the Driver PWA (`driver.html`) as `jccoffey@jccoffeyfoundation.org`, accept an active gig, and check that the accepted gig map displays in high-res Google Hybrid satellite view.

