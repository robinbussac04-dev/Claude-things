#include "Config.h"

#include <Windows.h>
#include <ShlObj.h>
#include <fstream>
#include <string>
#include <sstream>

namespace ldf {

Config::Config() {
    // Per-category defaults tuned for FN.
    aimProfiles[static_cast<int>(WeaponCategory::SMG)]     = { 5.0f,  100.0f };
    aimProfiles[static_cast<int>(WeaponCategory::AR)]      = { 6.0f,  120.0f };
    aimProfiles[static_cast<int>(WeaponCategory::Shotgun)] = { 12.0f, 220.0f };
    aimProfiles[static_cast<int>(WeaponCategory::Pistol)]  = { 7.0f,  110.0f };
    aimProfiles[static_cast<int>(WeaponCategory::Sniper)]  = { 3.0f,  80.0f  };
    aimProfiles[static_cast<int>(WeaponCategory::Default)] = { 8.0f,  150.0f };
}

Config& GetConfig() {
    static Config g;
    return g;
}

static std::wstring ConfigRoot() {
    PWSTR roam = nullptr;
    std::wstring result;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &roam))) {
        result = roam;
        result += L"\\breakout fn private";
        CreateDirectoryW(result.c_str(), nullptr);
        CoTaskMemFree(roam);
    }
    return result;
}

// Flat key=value text format. Not meant to be pretty; the overlay reads/writes it as-is.
#define KV_BOOL(name)  out << #name << "=" << (c.name ? 1 : 0) << "\n"
#define KV_INT(name)   out << #name << "=" << c.name << "\n"
#define KV_FLOAT(name) out << #name << "=" << c.name << "\n"
#define KV_COLOR(name) out << #name << "=" << c.name.r << "," << c.name.g << "," << c.name.b << "," << c.name.a << "\n"

bool SaveConfig(const wchar_t* path) {
    std::wstring full = path && *path ? path : (ConfigRoot() + L"\\last.cfg");
    std::ofstream out(full);
    if (!out) return false;
    const Config& c = GetConfig();

    KV_BOOL(aimEnabled);
    out << "aimHitbox=" << static_cast<int>(c.aimHitbox) << "\n";
    KV_BOOL(aimVisibleCheck);
    KV_BOOL(ignoreKnocked);
    KV_BOOL(teamCheck);
    KV_BOOL(aimPrediction);

    KV_FLOAT(aimSmoothing);
    KV_FLOAT(aimFov);
    KV_BOOL(aimDrawFov);
    KV_BOOL(fovFilled);
    KV_FLOAT(fovFillAlpha);
    KV_COLOR(colorFov);
    KV_COLOR(colorFovFill);

    KV_BOOL(aimGlobalSmooth);
    KV_BOOL(aimGlobalFov);
    KV_INT(aimWeaponEdit);
    for (int i = 0; i < static_cast<int>(WeaponCategory::Count); ++i) {
        out << "profile." << i << "="
            << c.aimProfiles[i].smooth << "," << c.aimProfiles[i].fov << "\n";
    }
    KV_FLOAT(aimLeadPad);

    KV_BOOL(enabled);
    KV_BOOL(names);
    KV_BOOL(distance);
    KV_BOOL(skeleton);
    KV_BOOL(showPlatform);
    KV_BOOL(showKills);
    KV_BOOL(showTeamId);
    KV_BOOL(showBots);
    KV_BOOL(boxCorners);
    KV_BOOL(boxFilled);
    KV_BOOL(box3D);
    KV_FLOAT(boxFilledAlpha);

    KV_COLOR(colorName);
    KV_COLOR(colorDistance);
    KV_COLOR(colorSkeleton);
    KV_COLOR(colorBoxCorners);
    KV_COLOR(colorBoxFilled);
    KV_COLOR(colorBox3D);
    KV_COLOR(colorKnocked);
    KV_COLOR(colorHidden);

    KV_FLOAT(maxDistance);
    KV_BOOL(streamProof);
    KV_INT(menuKey);
    KV_INT(unloadKey);
    KV_INT(aimKey);

    KV_BOOL(rainbow);
    KV_BOOL(snapline);
    KV_BOOL(showSelf);
    KV_FLOAT(thickness);
    KV_FLOAT(textSize);
    KV_FLOAT(boxWidth);
    KV_BOOL(radar);
    KV_BOOL(radarRound);
    KV_FLOAT(radarX);
    KV_FLOAT(radarY);
    KV_FLOAT(radarSize);
    KV_FLOAT(radarRange);
    KV_INT(overlayFpsLimit);
    KV_INT(overlayMonitor);
    KV_BOOL(blackout);
    KV_BOOL(uiSounds);
    KV_BOOL(debug);

    return true;
}

static Color4 ParseColor(const std::string& v) {
    Color4 c { 1.0f, 1.0f, 1.0f, 1.0f };
    std::stringstream ss(v);
    char comma;
    ss >> c.r >> comma >> c.g >> comma >> c.b >> comma >> c.a;
    return c;
}

bool LoadConfig(const wchar_t* path) {
    std::wstring full = path && *path ? path : (ConfigRoot() + L"\\last.cfg");
    std::ifstream in(full);
    if (!in) return false;
    Config& c = GetConfig();
    std::string line;
    while (std::getline(in, line)) {
        auto eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string k = line.substr(0, eq);
        std::string v = line.substr(eq + 1);

        if (k == "aimEnabled")        c.aimEnabled = (v != "0");
        else if (k == "aimHitbox")    c.aimHitbox = static_cast<AimHitbox>(std::stoi(v));
        else if (k == "aimVisibleCheck") c.aimVisibleCheck = (v != "0");
        else if (k == "ignoreKnocked")   c.ignoreKnocked = (v != "0");
        else if (k == "teamCheck")       c.teamCheck = (v != "0");
        else if (k == "aimPrediction")   c.aimPrediction = (v != "0");
        else if (k == "aimSmoothing")    c.aimSmoothing = std::stof(v);
        else if (k == "aimFov")          c.aimFov = std::stof(v);
        else if (k == "aimDrawFov")      c.aimDrawFov = (v != "0");
        else if (k == "fovFilled")       c.fovFilled = (v != "0");
        else if (k == "fovFillAlpha")    c.fovFillAlpha = std::stof(v);
        else if (k == "colorFov")        c.colorFov = ParseColor(v);
        else if (k == "colorFovFill")    c.colorFovFill = ParseColor(v);
        else if (k == "aimGlobalSmooth") c.aimGlobalSmooth = (v != "0");
        else if (k == "aimGlobalFov")    c.aimGlobalFov = (v != "0");
        else if (k == "aimWeaponEdit")   c.aimWeaponEdit = std::stoi(v);
        else if (k.rfind("profile.", 0) == 0) {
            int idx = std::stoi(k.substr(8));
            if (idx >= 0 && idx < static_cast<int>(WeaponCategory::Count)) {
                auto comma = v.find(',');
                if (comma != std::string::npos) {
                    c.aimProfiles[idx].smooth = std::stof(v.substr(0, comma));
                    c.aimProfiles[idx].fov    = std::stof(v.substr(comma + 1));
                }
            }
        }
        else if (k == "aimLeadPad")    c.aimLeadPad = std::stof(v);
        else if (k == "enabled")       c.enabled = (v != "0");
        else if (k == "names")         c.names = (v != "0");
        else if (k == "distance")      c.distance = (v != "0");
        else if (k == "skeleton")      c.skeleton = (v != "0");
        else if (k == "showPlatform")  c.showPlatform = (v != "0");
        else if (k == "showKills")     c.showKills = (v != "0");
        else if (k == "showTeamId")    c.showTeamId = (v != "0");
        else if (k == "showBots")      c.showBots = (v != "0");
        else if (k == "boxCorners")    c.boxCorners = (v != "0");
        else if (k == "boxFilled")     c.boxFilled = (v != "0");
        else if (k == "box3D")         c.box3D = (v != "0");
        else if (k == "boxFilledAlpha") c.boxFilledAlpha = std::stof(v);
        else if (k == "colorName")     c.colorName = ParseColor(v);
        else if (k == "colorDistance") c.colorDistance = ParseColor(v);
        else if (k == "colorSkeleton") c.colorSkeleton = ParseColor(v);
        else if (k == "colorBoxCorners") c.colorBoxCorners = ParseColor(v);
        else if (k == "colorBoxFilled") c.colorBoxFilled = ParseColor(v);
        else if (k == "colorBox3D")    c.colorBox3D = ParseColor(v);
        else if (k == "colorKnocked")  c.colorKnocked = ParseColor(v);
        else if (k == "colorHidden")   c.colorHidden = ParseColor(v);
        else if (k == "maxDistance")   c.maxDistance = std::stof(v);
        else if (k == "streamProof")   c.streamProof = (v != "0");
        else if (k == "menuKey")       c.menuKey   = static_cast<uint32_t>(std::stoul(v));
        else if (k == "unloadKey")     c.unloadKey = static_cast<uint32_t>(std::stoul(v));
        else if (k == "aimKey")        c.aimKey    = static_cast<uint32_t>(std::stoul(v));
        else if (k == "rainbow")       c.rainbow = (v != "0");
        else if (k == "snapline")      c.snapline = (v != "0");
        else if (k == "showSelf")      c.showSelf = (v != "0");
        else if (k == "thickness")     c.thickness = std::stof(v);
        else if (k == "textSize")      c.textSize = std::stof(v);
        else if (k == "boxWidth")      c.boxWidth = std::stof(v);
        else if (k == "radar")         c.radar = (v != "0");
        else if (k == "radarRound")    c.radarRound = (v != "0");
        else if (k == "radarX")        c.radarX = std::stof(v);
        else if (k == "radarY")        c.radarY = std::stof(v);
        else if (k == "radarSize")     c.radarSize = std::stof(v);
        else if (k == "radarRange")    c.radarRange = std::stof(v);
        else if (k == "overlayFpsLimit") c.overlayFpsLimit = std::stoi(v);
        else if (k == "overlayMonitor")  c.overlayMonitor = std::stoi(v);
        else if (k == "blackout")      c.blackout = (v != "0");
        else if (k == "uiSounds")      c.uiSounds = (v != "0");
        else if (k == "debug")         c.debug = (v != "0");
    }
    return true;
}

void OpenConfigFolder() {
    std::wstring root = ConfigRoot();
    if (!root.empty()) {
        ShellExecuteW(nullptr, L"open", root.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    }
}

} // namespace ldf
