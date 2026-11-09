#pragma once

#include <cstdint>

namespace ldf {

enum class AimHitbox : int {
    Head = 0,
    Neck,
    Chest,
    Pelvis,
    Count
};

inline const char* AimHitboxName(AimHitbox h) {
    switch (h) {
        case AimHitbox::Head:   return "Head";
        case AimHitbox::Neck:   return "Neck";
        case AimHitbox::Chest:  return "Chest";
        case AimHitbox::Pelvis: return "Pelvis";
        default:                return "?";
    }
}

enum class WeaponCategory : int {
    SMG = 0,
    AR,
    Shotgun,
    Pistol,
    Sniper,
    Default,
    Count
};

inline const char* WeaponCategoryName(WeaponCategory c) {
    switch (c) {
        case WeaponCategory::SMG:     return "SMG";
        case WeaponCategory::AR:      return "AR";
        case WeaponCategory::Shotgun: return "SHOTGUN";
        case WeaponCategory::Pistol:  return "Pistol";
        case WeaponCategory::Sniper:  return "SNIPER";
        case WeaponCategory::Default: return "DEFAULT";
        default:                      return "?";
    }
}

struct Color4 {
    float r, g, b, a;
};

struct WeaponProfile {
    float smooth = 6.0f;
    float fov    = 120.0f;
};

struct Config {
    // ---- Aimbot · AIM ----
    bool      aimEnabled       = true;
    AimHitbox aimHitbox        = AimHitbox::Head;
    bool      aimVisibleCheck  = true;
    bool      ignoreKnocked    = true;
    bool      teamCheck        = true;
    bool      aimPrediction    = true;

    // ---- Aimbot · CALIBRATION (global values) ----
    float aimSmoothing  = 6.0f;
    float aimFov        = 120.0f;
    bool  aimDrawFov    = true;
    bool  fovFilled     = true;
    float fovFillAlpha  = 0.25f;

    // ---- Aimbot · FOV Colors ----
    Color4 colorFov     { 0.608f, 0.549f, 1.000f, 1.000f }; // #9B8CFF
    Color4 colorFovFill { 0.608f, 0.549f, 1.000f, 0.250f };

    // ---- Aimbot · Advanced ----
    bool aimGlobalSmooth = false;
    bool aimGlobalFov    = true;

    // ---- Aimbot · Weapon Profiles (per-category) ----
    int            aimWeaponEdit = static_cast<int>(WeaponCategory::AR);
    WeaponProfile  aimProfiles[static_cast<int>(WeaponCategory::Count)];

    // ---- Aimbot · Ballistics pad ----
    float aimLeadPad = 60.0f; // ms

    // ---- Visual · ESP ----
    bool enabled      = true;
    bool names        = true;
    bool distance     = true;
    bool skeleton     = true;
    bool showPlatform = false;
    bool showKills    = false;
    bool showTeamId   = false;
    bool showBots     = true;

    // ---- Visual · Box ----
    bool boxCorners    = true;
    bool boxFilled     = false;
    bool box3D         = false;
    float boxFilledAlpha = 0.30f;

    // ---- Visual · Colors ----
    Color4 colorName       { 1.0f, 1.0f, 1.0f, 1.0f };
    Color4 colorDistance   { 0.90f, 0.90f, 0.95f, 1.0f };
    Color4 colorSkeleton   { 0.608f, 0.549f, 1.000f, 1.0f };
    Color4 colorBoxCorners { 1.0f, 1.0f, 1.0f, 1.0f };
    Color4 colorBoxFilled  { 0.608f, 0.549f, 1.000f, 0.30f };
    Color4 colorBox3D      { 0.608f, 0.549f, 1.000f, 1.0f };
    Color4 colorKnocked    { 1.0f, 0.42f, 0.42f, 1.0f };
    Color4 colorHidden     { 0.55f, 0.55f, 0.62f, 1.0f };

    // ---- Visual · Detection & Filled Box ----
    float maxDistance = 400.0f;

    // ---- Settings · System ----
    bool streamProof = true;

    // ---- Settings · Hotkeys ----
    uint32_t menuKey   = 0x2D; // VK_INSERT
    uint32_t unloadKey = 0x23; // VK_END
    uint32_t aimKey    = 0x02; // VK_RBUTTON

    // ---- Non-UI flags (preserved from spec) ----
    bool  rainbow        = false;
    bool  snapline       = false;
    bool  showSelf       = false;
    float thickness      = 1.5f;
    float textSize       = 14.0f;
    float boxWidth       = 0.42f;
    bool  radar          = false;
    bool  radarRound     = true;
    float radarX         = 20.0f;
    float radarY         = 20.0f;
    float radarSize      = 220.0f;
    float radarRange     = 200.0f;
    int   overlayFpsLimit = 0;
    int   overlayMonitor  = 0;
    bool  blackout       = false;
    bool  uiSounds       = false;
    bool  debug          = false;

    Config();
};

Config& GetConfig();

// Serialization
bool SaveConfig(const wchar_t* path);
bool LoadConfig(const wchar_t* path);
void OpenConfigFolder();

} // namespace ldf
