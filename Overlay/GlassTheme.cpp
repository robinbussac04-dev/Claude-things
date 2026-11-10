#include "GlassTheme.h"

#include "imgui_internal.h"

#include <cmath>

namespace ldf::glass {

void ApplyStyle() {
    ImGuiStyle& s = ImGui::GetStyle();

    s.WindowPadding       = ImVec2(0.0f, 0.0f);
    s.FramePadding        = ImVec2(8.0f, 4.0f);
    s.ItemSpacing         = ImVec2(10.0f, 8.0f);
    s.ItemInnerSpacing    = ImVec2(6.0f, 4.0f);
    s.IndentSpacing       = 12.0f;

    s.WindowRounding      = metric::kFrameRadius;
    s.FrameRounding       = 4.0f;
    s.PopupRounding       = 6.0f;
    s.ChildRounding       = metric::kPanelRadius;
    s.TabRounding         = 4.0f;
    s.GrabRounding        = 999.0f;
    s.ScrollbarRounding   = 999.0f;

    s.WindowBorderSize    = 0.0f;
    s.FrameBorderSize     = 0.0f;
    s.ChildBorderSize     = 0.0f;
    s.TabBorderSize       = 0.0f;

    auto rgba = [](ImU32 c) {
        return ImGui::ColorConvertU32ToFloat4(c);
    };

    ImVec4* col = s.Colors;
    col[ImGuiCol_Text]                 = rgba(color::kTextMain);
    col[ImGuiCol_TextDisabled]         = rgba(color::kTextFaint);
    col[ImGuiCol_WindowBg]             = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_ChildBg]              = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_PopupBg]              = ImVec4(0.11f, 0.08f, 0.22f, 0.95f);
    col[ImGuiCol_Border]               = rgba(color::kGlassStroke);
    col[ImGuiCol_BorderShadow]         = ImVec4(0, 0, 0, 0);

    col[ImGuiCol_FrameBg]              = rgba(color::kGlassFill);
    col[ImGuiCol_FrameBgHovered]       = rgba(color::kGlassFillHot);
    col[ImGuiCol_FrameBgActive]        = rgba(color::kAccentGhost);

    col[ImGuiCol_CheckMark]            = rgba(color::kAccent);
    col[ImGuiCol_SliderGrab]           = rgba(color::kAccent);
    col[ImGuiCol_SliderGrabActive]     = rgba(color::kAccent);

    col[ImGuiCol_Button]               = rgba(color::kGlassFill);
    col[ImGuiCol_ButtonHovered]        = rgba(color::kGlassFillHot);
    col[ImGuiCol_ButtonActive]         = rgba(color::kAccentGhost);

    col[ImGuiCol_Header]               = rgba(color::kAccentGhost);
    col[ImGuiCol_HeaderHovered]        = rgba(color::kGlassFillHot);
    col[ImGuiCol_HeaderActive]         = rgba(color::kAccent);

    col[ImGuiCol_Tab]                  = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_TabHovered]           = rgba(color::kGlassFillHot);
    col[ImGuiCol_TabActive]            = rgba(color::kAccentGhost);
    col[ImGuiCol_TabUnfocused]         = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_TabUnfocusedActive]   = rgba(color::kAccentGhost);

    col[ImGuiCol_Separator]            = rgba(color::kDividerSoft);
    col[ImGuiCol_SeparatorHovered]     = rgba(color::kAccentDim);
    col[ImGuiCol_SeparatorActive]      = rgba(color::kAccent);

    col[ImGuiCol_ResizeGrip]           = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_ScrollbarBg]          = ImVec4(0, 0, 0, 0);
    col[ImGuiCol_ScrollbarGrab]        = rgba(color::kGlassFillHot);
    col[ImGuiCol_ScrollbarGrabHovered] = rgba(color::kAccentDim);
    col[ImGuiCol_ScrollbarGrabActive]  = rgba(color::kAccent);
}

// Soft radial blob — concentric alpha discs fake a radial gradient.
static void DrawBlob(ImDrawList* dl, ImVec2 center, float radius, ImU32 col) {
    constexpr int kRings = 24;
    const int a0 = (col >> IM_COL32_A_SHIFT) & 0xFF;
    for (int i = kRings - 1; i >= 0; --i) {
        float t = static_cast<float>(i) / (kRings - 1);
        float r = radius * (0.25f + 0.75f * t);
        int a = static_cast<int>(a0 * (1.0f - t) * 0.5f);
        if (a <= 0) continue;
        ImU32 c = (col & 0x00FFFFFF) | (static_cast<ImU32>(a) << IM_COL32_A_SHIFT);
        dl->AddCircleFilled(center, r, c, 48);
    }
}

void DrawFrostedBackdrop(ImDrawList* dl, ImVec2 p0, ImVec2 p1) {
    // Base violet.
    dl->AddRectFilled(p0, p1, color::kBackdropMid, metric::kFrameRadius);

    // Two radial blobs — the "colored glow" behind the glass.
    ImVec2 sz(p1.x - p0.x, p1.y - p0.y);
    DrawBlob(dl, ImVec2(p0.x + sz.x * 0.20f, p0.y + sz.y * 0.10f),
             sz.y * 0.90f, color::kBackdropTop);
    DrawBlob(dl, ImVec2(p0.x + sz.x * 0.80f, p0.y + sz.y * 0.90f),
             sz.y * 0.90f, color::kBackdropBot);

    // Inset frame — the glass sheet itself.
    ImVec2 g0(p0.x + metric::kFrameInset, p0.y + metric::kFrameInset);
    ImVec2 g1(p1.x - metric::kFrameInset, p1.y - metric::kFrameInset);
    dl->AddRectFilled(g0, g1, IM_COL32(255, 255, 255, 8), metric::kFrameRadius);
    dl->AddRect(g0, g1, color::kGlassStroke, metric::kFrameRadius, 0, 1.0f);

    // Highlight sweep across the top — reads as a reflection.
    ImVec2 h0 = g0;
    ImVec2 h1(g1.x, g0.y + 80.0f);
    dl->AddRectFilledMultiColor(
        h0, h1,
        IM_COL32(255, 255, 255, 28),
        IM_COL32(255, 255, 255, 28),
        IM_COL32(255, 255, 255, 0),
        IM_COL32(255, 255, 255, 0)
    );
}

static bool BeginPanelInternal(const char* title, ImVec2 size) {
    ImGui::PushID(title);

    ImVec2 pos = ImGui::GetCursorScreenPos();
    ImVec2 end(pos.x + size.x, pos.y + size.y);
    ImDrawList* dl = ImGui::GetWindowDrawList();

    // Glass body + border.
    dl->AddRectFilled(pos, end, color::kGlassFill, metric::kPanelRadius);
    dl->AddRect(pos, end, color::kGlassStroke, metric::kPanelRadius, 0, 1.0f);

    // Inner highlight hairline — sells the "beveled" edge.
    ImVec2 ip0(pos.x + metric::kPanelRadius, pos.y + 1);
    ImVec2 ip1(end.x  - metric::kPanelRadius, pos.y + 1);
    dl->AddLine(ip0, ip1, IM_COL32(255, 255, 255, 36), 1.0f);

    // Title — uppercase would be even more on-model; keep the caller's casing.
    ImVec2 titlePos(pos.x + metric::kPanelPadX, pos.y + 10.0f);
    dl->AddText(titlePos, color::kAccent, title);
    ImVec2 ts = ImGui::CalcTextSize(title);
    // Accent-dim underline under the title only (inline-block feel).
    dl->AddLine(
        ImVec2(titlePos.x,          titlePos.y + ts.y + 4.0f),
        ImVec2(titlePos.x + ts.x,   titlePos.y + ts.y + 4.0f),
        color::kAccentDim, 1.0f
    );

    ImGui::SetCursorScreenPos(ImVec2(pos.x + metric::kPanelPadX, titlePos.y + ts.y + 16.0f));
    ImGui::BeginGroup();
    ImGui::PushItemWidth(size.x - metric::kPanelPadX * 2.0f - 90.0f);
    return true;
}

void DrawPanel(const char* title, ImVec2 size) {
    BeginPanelInternal(title, size);
}

void EndPanel() {
    ImGui::PopItemWidth();
    ImGui::EndGroup();
    ImGui::PopID();
}

bool Row(const char* label) {
    ImGui::Dummy(ImVec2(0.0f, 1.0f));
    ImVec2 pos = ImGui::GetCursorScreenPos();
    ImGui::GetWindowDrawList()->AddText(pos, color::kTextDim, label);

    // Reserve a right-side slot for the control.
    float panelRight = ImGui::GetWindowContentRegionMax().x + ImGui::GetWindowPos().x
                       - metric::kPanelPadX - 10.0f;
    ImGui::SameLine();
    ImVec2 ctrl(panelRight - 60.0f, pos.y);
    ImGui::SetCursorScreenPos(ctrl);
    return true;
}

bool Switch(const char* id, bool* v) {
    ImGui::PushID(id);
    const ImVec2 sz(metric::kSwitchW, metric::kSwitchH);
    ImVec2 pos = ImGui::GetCursorScreenPos();

    bool pressed = ImGui::InvisibleButton("##sw", sz);
    if (pressed) *v = !*v;

    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImU32 bg = *v ? color::kAccent : IM_COL32(255, 255, 255, 36);
    ImU32 knobCol = *v ? IM_COL32(255, 255, 255, 240) : IM_COL32(220, 220, 230, 200);

    ImVec2 end(pos.x + sz.x, pos.y + sz.y);
    dl->AddRectFilled(pos, end, bg, sz.y * 0.5f);

    float knobR = sz.y * 0.5f - 2.0f;
    float knobX = *v ? (end.x - knobR - 2.0f) : (pos.x + knobR + 2.0f);
    float knobY = pos.y + sz.y * 0.5f;
    dl->AddCircleFilled(ImVec2(knobX, knobY), knobR, knobCol);

    if (*v) {
        dl->AddCircle(ImVec2(knobX, knobY), knobR + 2.0f, color::kAccentDim, 0, 1.0f);
    }

    ImGui::PopID();
    ImGui::NewLine();
    return pressed;
}

bool Slider(const char* id, float* v, float lo, float hi, const char* fmt) {
    ImGui::PushID(id);
    float width = 140.0f;

    // Match the web demo: thin track filled in accent, white round thumb with accent ring.
    ImGui::PushStyleVar(ImGuiStyleVar_GrabMinSize, 14.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 999.0f);
    ImGui::PushStyleColor(ImGuiCol_FrameBg,        IM_COL32(255, 255, 255, 30));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(255, 255, 255, 40));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive,  IM_COL32(255, 255, 255, 40));
    ImGui::PushStyleColor(ImGuiCol_SliderGrab,        ImGui::ColorConvertU32ToFloat4(color::kAccent));
    ImGui::PushStyleColor(ImGuiCol_SliderGrabActive,  ImGui::ColorConvertU32ToFloat4(color::kAccent));

    ImGui::SetNextItemWidth(width);
    bool changed = ImGui::SliderFloat("##s", v, lo, hi, fmt);

    // Draw a little accent-filled portion up to the grab, over the dull track.
    ImVec2 rmin = ImGui::GetItemRectMin();
    ImVec2 rmax = ImGui::GetItemRectMax();
    float t = (hi > lo) ? ((*v - lo) / (hi - lo)) : 0.0f;
    if (t < 0) t = 0; if (t > 1) t = 1;
    float grabX = rmin.x + t * (rmax.x - rmin.x);
    float cy = (rmin.y + rmax.y) * 0.5f;
    ImDrawList* dl = ImGui::GetWindowDrawList();
    dl->AddRectFilled(
        ImVec2(rmin.x, cy - 2.0f),
        ImVec2(grabX,  cy + 2.0f),
        color::kAccent, 2.0f
    );
    // White thumb with accent ring + glow.
    dl->AddCircleFilled(ImVec2(grabX, cy), 7.0f, color::kAccentGhost);
    dl->AddCircleFilled(ImVec2(grabX, cy), 6.0f, IM_COL32(255, 255, 255, 240));
    dl->AddCircle(      ImVec2(grabX, cy), 6.0f, color::kAccent, 0, 2.0f);

    ImGui::PopStyleColor(5);
    ImGui::PopStyleVar(2);
    ImGui::PopID();
    return changed;
}

bool ColorDot(const char* id, float col[4]) {
    ImGui::PushID(id);
    const ImVec2 sz(metric::kColorChip, metric::kColorChip);
    ImVec2 pos = ImGui::GetCursorScreenPos();
    bool open = ImGui::InvisibleButton("##dot", sz);
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 center(pos.x + sz.x * 0.5f, pos.y + sz.y * 0.5f);
    float r = sz.x * 0.5f;
    ImU32 solid = ImGui::ColorConvertFloat4ToU32(ImVec4(col[0], col[1], col[2], 1.0f));
    // Outer white ring (2px) + inset shadow + colored fill.
    dl->AddCircleFilled(center, r,        IM_COL32(255, 255, 255, 60));
    dl->AddCircleFilled(center, r - 2.0f, solid);
    dl->AddCircle      (center, r - 2.0f, IM_COL32(0, 0, 0, 80), 0, 1.0f);

    if (open) ImGui::OpenPopup("picker");
    bool changed = false;
    if (ImGui::BeginPopup("picker")) {
        changed = ImGui::ColorPicker4("##pick", col,
            ImGuiColorEditFlags_NoLabel | ImGuiColorEditFlags_AlphaBar);
        ImGui::EndPopup();
    }

    ImGui::PopID();
    ImGui::NewLine();
    return changed;
}

bool Chip(const char* label, bool active) {
    ImGui::PushID(label);
    ImGuiStyle& s = ImGui::GetStyle();
    const float oldRadius = s.FrameRounding;
    s.FrameRounding = 999.0f;

    ImVec4 bg      = active ? ImGui::ColorConvertU32ToFloat4(color::kAccent)
                            : ImVec4(0, 0, 0, 0);
    ImVec4 bgHot   = active ? bg
                            : ImGui::ColorConvertU32ToFloat4(color::kGlassFillHot);
    ImVec4 border  = active ? bg
                            : ImGui::ColorConvertU32ToFloat4(color::kGlassStroke);
    ImVec4 text    = active ? ImVec4(0.11f, 0.08f, 0.22f, 1.0f)
                            : ImGui::ColorConvertU32ToFloat4(color::kTextDim);

    ImGui::PushStyleColor(ImGuiCol_Button,        bg);
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, bgHot);
    ImGui::PushStyleColor(ImGuiCol_ButtonActive,  bg);
    ImGui::PushStyleColor(ImGuiCol_Border,        border);
    ImGui::PushStyleColor(ImGuiCol_Text,          text);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(12.0f, 4.0f));

    bool r = ImGui::Button(label);

    ImGui::PopStyleVar(2);
    ImGui::PopStyleColor(5);
    s.FrameRounding = oldRadius;
    ImGui::PopID();
    return r;
}

bool HotkeyButton(const char* label, ImVec2 size, bool capturing) {
    ImGui::PushID(label);
    ImVec4 bg     = capturing ? ImGui::ColorConvertU32ToFloat4(color::kAccent)
                              : ImGui::ColorConvertU32ToFloat4(color::kGlassFill);
    ImVec4 text   = capturing ? ImVec4(0.11f, 0.08f, 0.22f, 1.0f)
                              : ImGui::ColorConvertU32ToFloat4(color::kAccent);
    if (capturing) {
        // Pulse by modulating alpha with ImGui's time.
        float t = 0.6f + 0.4f * ImSin(static_cast<float>(ImGui::GetTime()) * 5.0f);
        bg.w = t;
    }
    ImGui::PushStyleColor(ImGuiCol_Button,        bg);
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, bg);
    ImGui::PushStyleColor(ImGuiCol_ButtonActive,  bg);
    ImGui::PushStyleColor(ImGuiCol_Border,        ImGui::ColorConvertU32ToFloat4(color::kGlassStroke));
    ImGui::PushStyleColor(ImGuiCol_Text,          text);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 6.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(12.0f, 4.0f));
    bool r = ImGui::Button(label, size);
    ImGui::PopStyleVar(3);
    ImGui::PopStyleColor(5);
    ImGui::PopID();
    return r;
}

void PushButtonStyle() {
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 999.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(14.0f, 6.0f));
}

void PopButtonStyle() {
    ImGui::PopStyleVar(2);
}

bool DangerButton(const char* label, ImVec2 size) {
    ImGui::PushStyleColor(ImGuiCol_Button,        ImGui::ColorConvertU32ToFloat4(color::kDangerSoft));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImGui::ColorConvertU32ToFloat4(color::kDanger));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive,  ImGui::ColorConvertU32ToFloat4(color::kDanger));
    ImGui::PushStyleColor(ImGuiCol_Text,          ImVec4(1, 1, 1, 1));
    PushButtonStyle();
    bool r = ImGui::Button(label, size);
    PopButtonStyle();
    ImGui::PopStyleColor(4);
    return r;
}

bool GhostButton(const char* label, ImVec2 size) {
    PushButtonStyle();
    bool r = ImGui::Button(label, size);
    PopButtonStyle();
    return r;
}

// ---- Toast ---------------------------------------------------------------

namespace {
    char   g_toastMsg[128]  = {};
    double g_toastShownAt   = -10.0;
    constexpr double kToastSeconds = 1.4;
}

void Toast(const char* msg) {
    if (!msg) return;
    size_t n = 0;
    while (msg[n] && n + 1 < sizeof(g_toastMsg)) { g_toastMsg[n] = msg[n]; ++n; }
    g_toastMsg[n] = '\0';
    g_toastShownAt = ImGui::GetTime();
}

void DrawToast() {
    double now = ImGui::GetTime();
    double age = now - g_toastShownAt;
    if (age < 0 || age > kToastSeconds || !g_toastMsg[0]) return;

    // Fade: in over 0.15s, hold, out over 0.25s.
    float alpha = 1.0f;
    if (age < 0.15)                alpha = static_cast<float>(age / 0.15);
    else if (age > kToastSeconds - 0.25) alpha = static_cast<float>((kToastSeconds - age) / 0.25);
    if (alpha < 0) alpha = 0; if (alpha > 1) alpha = 1;

    ImGuiIO& io = ImGui::GetIO();
    ImVec2 ts = ImGui::CalcTextSize(g_toastMsg);
    ImVec2 pad(18.0f, 10.0f);
    ImVec2 size(ts.x + pad.x * 2.0f, ts.y + pad.y * 2.0f);
    ImVec2 pos(
        (io.DisplaySize.x - size.x) * 0.5f,
        io.DisplaySize.y - size.y - 40.0f
    );

    ImDrawList* dl = ImGui::GetForegroundDrawList();
    ImU32 bg     = IM_COL32(26, 11, 58, static_cast<int>(240 * alpha));
    ImU32 border = (color::kAccentDim & 0x00FFFFFF) | (static_cast<ImU32>(128 * alpha) << IM_COL32_A_SHIFT);
    ImU32 txt    = (color::kTextMain  & 0x00FFFFFF) | (static_cast<ImU32>(255 * alpha) << IM_COL32_A_SHIFT);
    dl->AddRectFilled(pos, ImVec2(pos.x + size.x, pos.y + size.y), bg, 999.0f);
    dl->AddRect      (pos, ImVec2(pos.x + size.x, pos.y + size.y), border, 999.0f, 0, 1.0f);
    dl->AddText(ImVec2(pos.x + pad.x, pos.y + pad.y), txt, g_toastMsg);
}

} // namespace ldf::glass
