# LDF Overlay · Glass Frosted

Overlay en C++ pour LDF FN Private, skin **Glass Frosted** : panels en verre dépoli translucide sur backdrop violet gradient, accent `#9B8CFF`.

Rend toutes les features de la spec UI (3 tabs — Aimbot / Visual / Settings, tous les panels, color pickers, hotkeys rebindables, stream-proof, save/load config).

## Fichiers

| Fichier           | Rôle |
| :---              | :--- |
| `main.cpp`        | Window layered topmost + D3D11 + ImGui + hot-key polling + driver bridge. |
| `Config.h/.cpp`   | Struct `Config` (tous les flags spec) + save/load text format vers `%APPDATA%\breakout fn private\last.cfg`. |
| `GlassTheme.h/.cpp` | Palette Glass Frosted, `ApplyStyle()`, primitives (backdrop gradient, panel en verre, switch, slider, color dot). |
| `UI.h/.cpp`       | Rendering des 3 tabs — Aimbot / Visual / Settings. |
| `CMakeLists.txt`  | Build (MSVC, UNICODE, Dear ImGui attendu dans `third_party/imgui/`). |

## Dépendances

- Dear ImGui 1.90+ (place le tree dans `Overlay/third_party/imgui/` avec son dossier `backends/`).
- Windows SDK, MSVC v143.
- D3D11, DWM.

## Build

```bash
cd Overlay
cmake -S . -B build -A x64
cmake --build build --config Release
```

## Hotkeys par défaut

- `INS` — toggle menu
- `END` — unload (IOCTL 0xE7E8 + exit)
- `RMB` — hold aim

Rebindables dans Settings → Hotkeys.

## Notes

- `streamProof` applique `WDA_EXCLUDEFROMCAPTURE` au boot si ON.
- La fenêtre est layered / topmost / click-through quand le menu est fermé, click-receptive quand il est ouvert.
- Le driver bridge (`drv::Open/Call/Close`) ouvre `\\.\BreakoutDrv`. Si le driver n'est pas mappé, le footer affiche `◆ Driver missing` en rouge.
- Les flags non-UI de la spec (rainbow, snapline, radar, thickness, overlayFpsLimit, etc.) sont présents dans `Config` et serialisés — utilisables via un config écrit à la main.
