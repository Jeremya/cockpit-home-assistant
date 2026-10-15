# Household inventory

Source: specification v4, household answers dated 2026-10-14, and runtime checks on 2026-10-15. This file records known inputs; it does not certify vendor compatibility.

| Item | Known input | Still to verify |
|---|---|---|
| Home Assistant | `2026.10.1` on the development Mac; onboarding complete; authenticated proof loads 44 entities and fresh entity/device/area registries, then passes resync and reconnect (2026-10-15) | Validate actual household integrations and the remaining native fault scenarios |
| Phone | Pixel 9 Pro, Android 17 / API 37; ARM64 development client installed and connected to HA over Wi-Fi (2026-10-15) | Remaining native Wi-Fi-loss and HA restart cases; standalone release validation |
| TP-Link Kasa plug | Actual HS103(US), already provisioned in Kasa; added through official TP-Link Smart Home integration and assigned to the existing Salon area (2026-10-15) | Confirm display on the phone; physical switching and Cockpit controls remain untested |
| Nest | Learning Thermostat | Exact generation, cloud/Matter path, supported targets/modes |
| Schlage | Encode Plus | Number of locks, code requirements, physical-state latency |
| Samsung | Supplied identifier `AFH-US-M64-24-T7XXMU` | Match actual SmartThings model/capabilities; measured readings versus setpoints |
| Ring | Several cameras; subscription active | Exact models and working recording-image path on this HA instance |
| AIRTAP | Firmware/revision `F1.0.26`; no Bluetooth adapter | Exact hardware and an HA-compatible Bluetooth path/proxies |
| iOS | No target iPhone/signing path supplied | Deferred |

The first physical-device proof passes through Cockpit's actual HA backend and visibility/room selectors: the Kasa plug has an available `switch` state, is visible by default and resolves to Salon, with fresh entity/device/area registries. Its configuration LED is hidden by default. No power changes or HA device service calls were sent. This exposed and fixed normalization of HA's `area_id` into Cockpit's internal area `id`; a regression covers initial grouping, retained rooms after a failed registry refresh and authoritative area removal. Detailed evidence, identifiers and network addresses stay in ignored `.local/` files. The household location supplied by the user is the first-floor living room; placement on the drawing is not configured yet.

The future dedicated HA box changes the app's endpoint, but the current origin-bound profile design will create a new local profile. Preserve or explicitly migrate household preferences when making that move.
