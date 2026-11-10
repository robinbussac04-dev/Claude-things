# LDF Overlay · Glass Frosted

C++ overlay for LDF FN Private, **Glass Frosted** skin: translucent frosted-glass panels over a violet gradient backdrop, accent `#9B8CFF`.

Renders the full UI spec (3 tabs — Aimbot / Visual / Settings, every panel, color pickers, rebindable hotkeys, stream-proof, save/load config).

## Files

| File              | Role |
| :---              | :--- |
| `main.cpp`        | Layered topmost window + D3D11 + ImGui + hotkey polling + driver bridge. |
| `Config.h/.cpp`   | `Config` struct (every flag from the spec) + text save/load to `%APPDATA%\breakout fn private\last.cfg`. |
| `GlassTheme.h/.cpp` | Glass Frosted palette, `ApplyStyle()`, primitives (backdrop blobs, glass panel, switch, slider, color dot, chip, hotkey button, toast). |
| `UI.h/.cpp`       | Renders the three tabs — Aimbot / Visual / Settings. |
| `CMakeLists.txt`  | Build (MSVC, UNICODE, expects Dear ImGui under `third_party/imgui/`). |
| `demo/index.html` | Interactive web demo of the same UI (mobile-ready). |

## Dependencies

- Dear ImGui 1.90+ — drop the tree in `Overlay/third_party/imgui/` with its `backends/` folder.
- Windows SDK, MSVC v143.
- D3D11, DWM.

## Build

```bash
cd Overlay
cmake -S . -B build -A x64
cmake --build build --config Release
```

## Default hotkeys

- `INS` — toggle menu
- `END` — unload (IOCTL 0xE7E8 + exit)
- `RMB` — hold to aim

Rebindable under Settings → Hotkeys.

## Notes

- `streamProof` applies `WDA_EXCLUDEFROMCAPTURE` on boot when ON.
- The window is layered / topmost / click-through while the menu is closed, click-receptive while it is open.
- The driver bridge (`drv::Open/Call/Close`) opens `\\.\BreakoutDrv`. When the driver isn't mapped the footer shows `◆ Driver missing` in red.
- Non-UI spec flags (rainbow, snapline, radar, thickness, overlayFpsLimit, etc.) are present in `Config` and serialized — editable via a hand-written config file.
