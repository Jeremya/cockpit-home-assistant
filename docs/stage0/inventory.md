# Household inventory

Source: specification v3, household answers dated 2026-10-14. This file records known inputs; it does not certify vendor compatibility.

| Item | Known input | Still to verify |
|---|---|---|
| Home Assistant | `2026.10.1` on the development Mac; onboarding complete; authenticated proof loads 44 entities and fresh entity/device/area registries, then passes resync and reconnect (2026-10-15) | Prove the same connection on the Pixel and validate actual household integrations |
| Phone | Pixel 9; Android-first | Android version, SDK installation and native development-client installation |
| Nest | Learning Thermostat | Exact generation, cloud/Matter path, supported targets/modes |
| Schlage | Encode Plus | Number of locks, code requirements, physical-state latency |
| Samsung | Supplied identifier `AFH-US-M64-24-T7XXMU` | Match actual SmartThings model/capabilities; measured readings versus setpoints |
| Ring | Several cameras; subscription active | Exact models and working recording-image path on this HA instance |
| AIRTAP | Firmware/revision `F1.0.26`; no Bluetooth adapter | Exact hardware and an HA-compatible Bluetooth path/proxies |
| iOS | No target iPhone/signing path supplied | Deferred |

The future dedicated HA box changes the app's endpoint, but the current origin-bound profile design will create a new local profile. Preserve or explicitly migrate household preferences when making that move.
