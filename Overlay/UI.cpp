#include "UI.h"

#include "Config.h"
#include "GlassTheme.h"

#include "imgui.h"
#include "imgui_internal.h"

#include <array>
#include <cstdio>

namespace ldf::ui {

using namespace ldf::glass;

enum class Tab { Aimbot, Visual, Settings };

static Tab g_tab = Tab::Aimbot;

static const char* TabName(Tab t) {
    switch (t) {
        case Tab::Aimbot:   return "Aimbot";
        case Tab::Visual:   return "Visual";
        case Tab::Settings: return "Settings";
    }
    return "?";
}

static void DrawTabs(ImVec2 origin, ImVec2 size) {
    ImDrawList* dl = ImGui::GetWindowDrawList();

    Tab tabs[] = { Tab::Aimbot, Tab::Visual, Tab::Settings };
    const float padX = 22.0f;
    float x = origin.x + metric::kPanelPadX;

    for (Tab t : tabs) {
        const char* name = TabName(t);
        ImVec2 ts = ImGui::CalcTextSize(name);
        ImVec2 p0(x, origin.y);
        ImVec2 p1(x + ts.x + padX, origin.y + size.y);

        ImGui::SetCursorScreenPos(p0);
        ImGui::PushID(name);
        if (ImGui::InvisibleButton("##tab", ImVec2(p1.x - p0.x, p1.y - p0.y))) {
            g_tab = t;
        }
        ImGui::PopID();

        bool hot = ImGui::IsItemHovered();
        bool on  = (g_tab == t);
        ImU32 textCol = on ? color::kAccent
                           : (hot ? color::kTextMain : color::kTextDim);
        dl->AddText(
            ImVec2(p0.x + padX * 0.5f, p0.y + (p1.y - p0.y - ts.y) * 0.5f),
            textCol, name
        );
        if (on) {
            dl->AddLine(
                ImVec2(p0.x + 6, p1.y - 2),
                ImVec2(p1.x - 6, p1.y - 2),
                color::kAccent, 1.5f
            );
        }
        x += ts.x + padX + 6.0f;
    }

    // Hairline under tab row.
    dl->AddLine(
        ImVec2(origin.x + metric::kPanelPadX, origin.y + size.y),
        ImVec2(origin.x + size.x - metric::kPanelPadX, origin.y + size.y),
        color::kDividerSoft, 1.0f
    );
}

static void DrawAimbotTab(ImVec2 body, ImVec2 bodyEnd) {
    Config& c = GetConfig();
    const float colW = (bodyEnd.x - body.x - 24.0f) / 3.0f;

    // ---- Column 0 ----
    ImGui::SetCursorScreenPos(body);
    DrawPanel("AIM", ImVec2(colW, 190));
        Row("Enabled");         Switch("##en", &c.aimEnabled);
        Row("Hitbox");
        {
            const char* names[] = { "Head", "Neck", "Chest", "Pelvis" };
            ImGui::SetNextItemWidth(70);
            int cur = static_cast<int>(c.aimHitbox);
            if (ImGui::Combo("##hb", &cur, names, 4)) {
                c.aimHitbox = static_cast<AimHitbox>(cur);
            }
            ImGui::NewLine();
        }
        Row("Visibility");      Switch("##vis", &c.aimVisibleCheck);
        Row("Ignore DBNO");     Switch("##dbno", &c.ignoreKnocked);
        Row("Ignore team");     Switch("##team", &c.teamCheck);
        Row("Prediction");      Switch("##pred", &c.aimPrediction);
    EndPanel();

    // ---- Column 1 ----
    ImGui::SetCursorScreenPos(ImVec2(body.x + colW + 12, body.y));
    DrawPanel("CALIBRATION", ImVec2(colW, 190));
        const bool perWeapon = !c.aimGlobalSmooth || !c.aimGlobalFov;
        float& smoothRef = (!c.aimGlobalSmooth && perWeapon)
            ? c.aimProfiles[c.aimWeaponEdit].smooth
            : c.aimSmoothing;
        float& fovRef = (!c.aimGlobalFov && perWeapon)
            ? c.aimProfiles[c.aimWeaponEdit].fov
            : c.aimFov;

        Row("Smooth");       Slider("##sm", &smoothRef, 1.0f, 50.0f, "%.1f");  ImGui::NewLine();
        Row("FOV");          Slider("##fv", &fovRef,    1.0f, 400.0f, "%.0f"); ImGui::NewLine();
        Row("Show FOV");     Switch("##sf", &c.aimDrawFov);
        Row("Filled FOV");   Switch("##ff", &c.fovFilled);
        Row("Opacity");      Slider("##op", &c.fovFillAlpha, 0.0f, 1.0f, "%.2f"); ImGui::NewLine();
    EndPanel();

    ImGui::SetCursorScreenPos(ImVec2(body.x + colW + 12, body.y + 198));
    DrawPanel("FOV COLORS", ImVec2(colW, 92));
        Row("Circle");  ColorDot("##cc", &c.colorFov.r);
        Row("Fill");    ColorDot("##fc", &c.colorFovFill.r);
    EndPanel();

    // ---- Column 2 ----
    ImGui::SetCursorScreenPos(ImVec2(body.x + (colW + 12) * 2, body.y));
    DrawPanel("ADVANCED", ImVec2(colW, 92));
        Row("Global smooth"); Switch("##gs", &c.aimGlobalSmooth);
        Row("Global FOV");    Switch("##gf", &c.aimGlobalFov);
    EndPanel();

    ImGui::SetCursorScreenPos(ImVec2(body.x + (colW + 12) * 2, body.y + 100));
    DrawPanel("WEAPON PROFILES", ImVec2(colW, 220));
        const char* names[] = { "SMG", "AR", "SHOTGUN", "Pistol", "SNIPER", "DEFAULT" };
        ImGui::BeginGroup();
        float rowX = ImGui::GetCursorScreenPos().x;
        float wrapW = colW - metric::kPanelPadX * 2.0f - 8.0f;
        for (int i = 0; i < 6; ++i) {
            if (Chip(names[i], c.aimWeaponEdit == i)) c.aimWeaponEdit = i;
            // Wrap chips manually so the row behaves like the web demo's flex-wrap.
            ImVec2 last = ImGui::GetItemRectMax();
            float nextX = last.x + 4.0f;
            if (i + 1 < 6) {
                ImVec2 nextSize = ImGui::CalcTextSize(names[i + 1]);
                if (nextX + nextSize.x + 24.0f > rowX + wrapW) {
                    // stay on a new line
                } else {
                    ImGui::SameLine(0, 4.0f);
                }
            }
        }
        ImGui::EndGroup();
        ImGui::Dummy(ImVec2(0, 4));

        WeaponProfile& p = c.aimProfiles[c.aimWeaponEdit];
        if (!c.aimGlobalSmooth) {
            Row("Smooth"); Slider("##wsm", &p.smooth, 1.0f, 50.0f, "%.1f"); ImGui::NewLine();
        }
        if (!c.aimGlobalFov) {
            Row("FOV"); Slider("##wfv", &p.fov, 1.0f, 400.0f, "%.0f"); ImGui::NewLine();
        }
        Row("Lead pad");
        Slider("##lp", &c.aimLeadPad, 0.0f, 200.0f, "%.0f ms");
        ImGui::NewLine();
    EndPanel();
}

static void DrawVisualTab(ImVec2 body, ImVec2 bodyEnd) {
    Config& c = GetConfig();
    const float colW = (bodyEnd.x - body.x - 24.0f) / 3.0f;

    // ---- Column 0 ----
    ImGui::SetCursorScreenPos(body);
    DrawPanel("ESP", ImVec2(colW, 190));
        Row("Enabled");       Switch("##ve", &c.enabled);
        Row("Name");          Switch("##vn", &c.names);
        Row("Distance");      Switch("##vd", &c.distance);
        Row("Skeleton");      Switch("##vs", &c.skeleton);
        Row("Platform");      Switch("##vp", &c.showPlatform);
        Row("Kills");         Switch("##vk", &c.showKills);
        Row("Team ID");       Switch("##vt", &c.showTeamId);
        Row("Show NPCs");     Switch("##vb", &c.showBots);
    EndPanel();

    ImGui::SetCursorScreenPos(ImVec2(body.x, body.y + 198));
    DrawPanel("BOX", ImVec2(colW, 92));
        Row("Corners");    Switch("##bc", &c.boxCorners);
        Row("Filled");     Switch("##bf", &c.boxFilled);
        Row("3D box");     Switch("##b3", &c.box3D);
    EndPanel();

    // ---- Column 1 ----
    ImGui::SetCursorScreenPos(ImVec2(body.x + colW + 12, body.y));
    DrawPanel("COLORS", ImVec2(colW, 290));
        Row("Name");         ColorDot("##cN", &c.colorName.r);
        Row("Distance");     ColorDot("##cD", &c.colorDistance.r);
        Row("Skeleton");     ColorDot("##cS", &c.colorSkeleton.r);
        Row("Box corners");  ColorDot("##cC", &c.colorBoxCorners.r);
        Row("Filled box");   ColorDot("##cF", &c.colorBoxFilled.r);
        Row("3D box");       ColorDot("##c3", &c.colorBox3D.r);
        Row("Knocked");      ColorDot("##cK", &c.colorKnocked.r);
        Row("Hidden");       ColorDot("##cH", &c.colorHidden.r);
    EndPanel();

    // ---- Column 2 ----
    ImGui::SetCursorScreenPos(ImVec2(body.x + (colW + 12) * 2, body.y));
    DrawPanel("DETECTION", ImVec2(colW, 92));
        Row("Max distance"); Slider("##md", &c.maxDistance, 20.0f, 2000.0f, "%.0f m"); ImGui::NewLine();
    EndPanel();

    ImGui::SetCursorScreenPos(ImVec2(body.x + (colW + 12) * 2, body.y + 100));
    DrawPanel("FILLED BOX", ImVec2(colW, 92));
        Row("Opacity"); Slider("##fbo", &c.boxFilledAlpha, 0.0f, 1.0f, "%.2f"); ImGui::NewLine();
    EndPanel();
}

static char g_rebind = 0; // 0 none, 'm' menu, 'u' unload, 'a' aim

static void CaptureRebind() {
    for (int vk = 0x01; vk < 0xFF; ++vk) {
        if (vk == VK_LBUTTON && g_rebind != 'a') continue;
        if ((GetAsyncKeyState(vk) & 0x8000) != 0) {
            Config& c = GetConfig();
            if (g_rebind == 'm') c.menuKey   = vk;
            if (g_rebind == 'u') c.unloadKey = vk;
            if (g_rebind == 'a') c.aimKey    = vk;
            g_rebind = 0;
            break;
        }
    }
}

static const char* VkName(uint32_t vk) {
    static char buf[32];
    switch (vk) {
        case VK_INSERT: return "INS";
        case VK_END:    return "END";
        case VK_HOME:   return "HOME";
        case VK_DELETE: return "DEL";
        case VK_RBUTTON: return "RMB";
        case VK_LBUTTON: return "LMB";
        case VK_MBUTTON: return "MMB";
        case VK_XBUTTON1: return "X1";
        case VK_XBUTTON2: return "X2";
        default: break;
    }
    UINT sc = MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
    if (sc && GetKeyNameTextA(static_cast<LONG>(sc << 16), buf, sizeof(buf))) {
        return buf;
    }
    std::snprintf(buf, sizeof(buf), "0x%02X", vk);
    return buf;
}

static void DrawSettingsTab(ImVec2 body, ImVec2 bodyEnd) {
    Config& c = GetConfig();
    const float colW = (bodyEnd.x - body.x - 24.0f) / 3.0f;

    if (g_rebind) CaptureRebind();

    // ---- Column 0 ----
    ImGui::SetCursorScreenPos(body);
    DrawPanel("CONFIGURATION", ImVec2(colW, 190));
        if (GhostButton("Save",   ImVec2(colW - 36, 28))) {
            SaveConfig(nullptr);
            Toast("Config saved");
        }
        if (GhostButton("Load",   ImVec2(colW - 36, 28))) {
            LoadConfig(nullptr);
            Toast("Config loaded");
        }
        if (GhostButton("Open config folder", ImVec2(colW - 36, 28))) OpenConfigFolder();
    EndPanel();

    // ---- Column 1 ----
    ImGui::SetCursorScreenPos(ImVec2(body.x + colW + 12, body.y));
    DrawPanel("SYSTEM", ImVec2(colW, 92));
        Row("Stream proof"); Switch("##sp", &c.streamProof);
    EndPanel();

    ImGui::SetCursorScreenPos(ImVec2(body.x + colW + 12, body.y + 100));
    DrawPanel("HOTKEYS", ImVec2(colW, 190));
        {
            char buf[64];
            Row("Menu key");
            std::snprintf(buf, sizeof(buf), "%s##mk",
                (g_rebind == 'm') ? "..." : VkName(c.menuKey));
            if (HotkeyButton(buf, ImVec2(80, 24), g_rebind == 'm')) g_rebind = 'm';
            ImGui::NewLine();

            Row("Unload key");
            std::snprintf(buf, sizeof(buf), "%s##uk",
                (g_rebind == 'u') ? "..." : VkName(c.unloadKey));
            if (HotkeyButton(buf, ImVec2(80, 24), g_rebind == 'u')) g_rebind = 'u';
            ImGui::NewLine();

            Row("Aim key");
            std::snprintf(buf, sizeof(buf), "%s##ak",
                (g_rebind == 'a') ? "..." : VkName(c.aimKey));
            if (HotkeyButton(buf, ImVec2(80, 24), g_rebind == 'a')) g_rebind = 'a';
            ImGui::NewLine();
        }
    EndPanel();

    // ---- Column 2 ----
    static double s_armedAt = -10.0;
    const double now = ImGui::GetTime();
    const bool armed = (now - s_armedAt) < 2.5;

    ImGui::SetCursorScreenPos(ImVec2(body.x + (colW + 12) * 2, body.y));
    DrawPanel("UNINSTALL", ImVec2(colW, 190));
        ImGui::TextColored(
            ImGui::ColorConvertU32ToFloat4(color::kTextDim),
            "Décharge le driver kernel,\nwipe les artifacts, ferme\nl'overlay. Pas de retour."
        );
        ImGui::Dummy(ImVec2(0, 8));
        const char* label = armed ? "TAP AGAIN TO CONFIRM" : "REMOVE CHEAT";
        if (DangerButton(label, ImVec2(colW - 36, 32))) {
            if (armed) {
                extern void RequestUninstall();
                RequestUninstall();
            } else {
                s_armedAt = now;
            }
        }
    EndPanel();
}

void DrawMenu(bool* open) {
    if (!open || !*open) return;

    ImGuiIO& io = ImGui::GetIO();
    ImVec2 center(io.DisplaySize.x * 0.5f, io.DisplaySize.y * 0.5f);
    ImVec2 size(metric::kMenuW, metric::kMenuH);
    ImVec2 pos(center.x - size.x * 0.5f, center.y - size.y * 0.5f);

    ImGui::SetNextWindowPos(pos, ImGuiCond_Always);
    ImGui::SetNextWindowSize(size, ImGuiCond_Always);

    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0, 0));
    ImGui::Begin("##ldf", open,
        ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
        ImGuiWindowFlags_NoMove     | ImGuiWindowFlags_NoScrollbar |
        ImGuiWindowFlags_NoScrollWithMouse | ImGuiWindowFlags_NoCollapse |
        ImGuiWindowFlags_NoBringToFrontOnFocus);
    ImGui::PopStyleVar();

    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 p0 = ImGui::GetWindowPos();
    ImVec2 p1(p0.x + size.x, p0.y + size.y);
    DrawFrostedBackdrop(dl, p0, p1);

    // Title on the glass.
    {
        const char* brand = "LDF · FN · PRIVATE";
        ImVec2 ts = ImGui::CalcTextSize(brand);
        dl->AddText(
            ImVec2(p1.x - metric::kFrameInset - ts.x - 10.0f, p0.y + metric::kFrameInset + 6.0f),
            color::kAccent, brand
        );
    }

    // Tabs row.
    ImVec2 tabOrigin(p0.x + metric::kFrameInset, p0.y + metric::kFrameInset + 30.0f);
    ImVec2 tabSize(size.x - metric::kFrameInset * 2.0f, 30.0f);
    DrawTabs(tabOrigin, tabSize);

    // Body area.
    ImVec2 body(tabOrigin.x + 6.0f, tabOrigin.y + tabSize.y + 14.0f);
    ImVec2 bodyEnd(p1.x - metric::kFrameInset - 6.0f, p1.y - metric::kFrameInset - 32.0f);

    switch (g_tab) {
        case Tab::Aimbot:   DrawAimbotTab(body, bodyEnd);   break;
        case Tab::Visual:   DrawVisualTab(body, bodyEnd);   break;
        case Tab::Settings: DrawSettingsTab(body, bodyEnd); break;
    }

    // Footer.
    ImVec2 fl(p0.x + metric::kFrameInset + 10.0f, p1.y - metric::kFrameInset - 20.0f);
    ImVec2 fr = ImVec2(p1.x - metric::kFrameInset - 10.0f, fl.y);

    extern bool g_driverReachable;
    const char* driver = g_driverReachable ? "◆ Driver OK" : "◆ Driver missing";
    ImU32 driverCol = g_driverReachable ? color::kAccent : color::kDanger;
    dl->AddText(fl, driverCol, driver);

    Config& c = GetConfig();
    char hint[128];
    std::snprintf(hint, sizeof(hint), "%s · menu   %s · unload   %s · aim",
        VkName(c.menuKey), VkName(c.unloadKey), VkName(c.aimKey));
    ImVec2 hintSize = ImGui::CalcTextSize(hint);
    dl->AddText(ImVec2(fr.x - hintSize.x, fr.y), color::kTextDim, hint);

    ImGui::End();

    // Toasts sit on top regardless of the menu state.
    DrawToast();
}

} // namespace ldf::ui
