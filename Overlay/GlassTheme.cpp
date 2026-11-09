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

void DrawFrostedBackdrop(ImDrawList* dl, ImVec2 p0, ImVec2 p1) {
    // Triadic violet gradient — the "back of the glass".
    dl->AddRectFilledMultiColor(
        p0, p1,
        color::kBackdropTop,
        color::kBackdropMid,
        color::kBackdropBot,
        color::kBackdropMid
    );

    // Inset frame — the glass sheet itself.
    ImVec2 g0(p0.x + metric::kFrameInset, p0.y + metric::kFrameInset);
    ImVec2 g1(p1.x - metric::kFrameInset, p1.y - metric::kFrameInset);
    dl->AddRectFilled(g0, g1, IM_COL32(255, 255, 255, 10), metric::kFrameRadius);
    dl->AddRect(g0, g1, color::kGlassStroke, metric::kFrameRadius, 0, 1.2f);

    // Highlight sweep across the top — reads as a reflection.
    ImVec2 h0 = g0;
    ImVec2 h1(g1.x, g0.y + 80.0f);
    dl->AddRectFilledMultiColor(
        h0, h1,
        IM_COL32(255, 255, 255, 22),
        IM_COL32(255, 255, 255, 22),
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
    ImVec2 ip0(pos.x + 1, pos.y + 1);
    ImVec2 ip1(end.x - 1, pos.y + 1);
    dl->AddLine(ip0, ip1, IM_COL32(255, 255, 255, 32), 1.0f);

    // Title.
    ImVec2 titlePos(pos.x + metric::kPanelPadX, pos.y + 10.0f);
    dl->AddText(titlePos, color::kAccent, title);
    ImVec2 ts = ImGui::CalcTextSize(title);
    dl->AddLine(
        ImVec2(titlePos.x, titlePos.y + ts.y + 4.0f),
        ImVec2(titlePos.x + ts.x, titlePos.y + ts.y + 4.0f),
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
    float width = 120.0f;
    ImGui::SetNextItemWidth(width);

    // Push accent colors so the slider track picks up the glass accent.
    bool changed = ImGui::SliderFloat("##s", v, lo, hi, fmt);

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
    ImU32 solid = ImGui::ColorConvertFloat4ToU32(ImVec4(col[0], col[1], col[2], 1.0f));
    dl->AddCircleFilled(center, sz.x * 0.5f, solid);
    dl->AddCircle(center, sz.x * 0.5f, IM_COL32(255, 255, 255, 120), 0, 1.0f);

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

} // namespace ldf::glass
