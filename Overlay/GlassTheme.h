#pragma once

#include "imgui.h"

namespace ldf::glass {

// Glass Frosted palette — translucent panels over a violet backdrop,
// cold white text, one accent (#9B8CFF).
namespace color {
    inline constexpr ImU32 kBackdropTop   = IM_COL32(43,  30,  74, 255); // #2B1E4A
    inline constexpr ImU32 kBackdropMid   = IM_COL32(26,  11,  58, 255); // #1A0B3A
    inline constexpr ImU32 kBackdropBot   = IM_COL32(58,  24,  66, 255); // #3A1842

    inline constexpr ImU32 kGlassFill     = IM_COL32(255, 255, 255,  15); // panel body
    inline constexpr ImU32 kGlassFillHot  = IM_COL32(255, 255, 255,  26);
    inline constexpr ImU32 kGlassStroke   = IM_COL32(255, 255, 255,  36); // panel border
    inline constexpr ImU32 kGlassInner    = IM_COL32(255, 255, 255,  10); // inner glow

    inline constexpr ImU32 kAccent        = IM_COL32(155, 140, 255, 255); // #9B8CFF
    inline constexpr ImU32 kAccentDim     = IM_COL32(155, 140, 255, 120);
    inline constexpr ImU32 kAccentGhost   = IM_COL32(155, 140, 255,  30);

    inline constexpr ImU32 kTextMain      = IM_COL32(246, 244, 255, 255);
    inline constexpr ImU32 kTextDim       = IM_COL32(246, 244, 255, 150);
    inline constexpr ImU32 kTextFaint     = IM_COL32(246, 244, 255,  90);

    inline constexpr ImU32 kDanger        = IM_COL32(255,  96, 112, 255);
    inline constexpr ImU32 kDangerSoft    = IM_COL32(255,  96, 112, 110);

    inline constexpr ImU32 kDividerSoft   = IM_COL32(255, 255, 255,  14);
}

namespace metric {
    inline constexpr float kMenuW       = 900.0f;
    inline constexpr float kMenuH       = 500.0f;
    inline constexpr float kFrameInset  = 20.0f;
    inline constexpr float kPanelRadius = 8.0f;
    inline constexpr float kFrameRadius = 16.0f;
    inline constexpr float kPanelPadX   = 14.0f;
    inline constexpr float kPanelPadY   = 12.0f;
    inline constexpr float kRowH        = 24.0f;
    inline constexpr float kSwitchW     = 34.0f;
    inline constexpr float kSwitchH     = 18.0f;
    inline constexpr float kColorChip   = 20.0f;
}

void ApplyStyle();
void PushButtonStyle();
void PopButtonStyle();

// Low-level primitives that give the Glass Frosted look.
void DrawFrostedBackdrop(ImDrawList* dl, ImVec2 p0, ImVec2 p1);
void DrawPanel(const char* title, ImVec2 size);
void EndPanel();

bool Switch(const char* id, bool* v);
bool Slider(const char* id, float* v, float lo, float hi, const char* fmt);
bool ColorDot(const char* id, float col[4]);
bool Row(const char* label); // puts label on left, yields right side cursor

bool DangerButton(const char* label, ImVec2 size);
bool GhostButton(const char* label, ImVec2 size);

// Pill chip that lights up when active (weapon categories, modes, …).
bool Chip(const char* label, bool active);

// Rebind-style hotkey button; pulses when capturing.
bool HotkeyButton(const char* label, ImVec2 size, bool capturing);

// Toast message at screen bottom; call Toast(...) to arm, DrawToast() each frame.
void Toast(const char* msg);
void DrawToast();

} // namespace ldf::glass
