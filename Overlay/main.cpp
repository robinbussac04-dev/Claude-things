// Overlay entry — window creation, D3D11 device, ImGui setup, main loop.
// The UI is Glass Frosted (see GlassTheme.cpp, UI.cpp).
//
// Build with the vcxproj / CMakeLists.txt in this folder.
// Requires Dear ImGui 1.90+ with Win32 and D3D11 backends.

#include "Config.h"
#include "GlassTheme.h"
#include "UI.h"

#include <Windows.h>
#include <d3d11.h>
#include <dwmapi.h>
#include <tchar.h>

#include "imgui.h"
#include "backends/imgui_impl_dx11.h"
#include "backends/imgui_impl_win32.h"

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dwmapi.lib")

// Forward-declared from UI.cpp.
bool g_driverReachable = true;
void RequestUninstall();

// ---- Driver bridge --------------------------------------------------------
// The actual IOCTL goes to BreakoutDrv.sys once it's mapped. This is the
// only place the overlay crosses the kernel boundary; everything else is
// user-mode rendering.

namespace ldf::drv {
    bool Open();
    void Close();
    bool Call(uint32_t code, const void* in, uint32_t inSize,
              void* out, uint32_t outSize);
}

static HANDLE g_drvHandle = INVALID_HANDLE_VALUE;

bool ldf::drv::Open() {
    g_drvHandle = CreateFileW(L"\\\\.\\BreakoutDrv",
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_EXISTING, 0, nullptr);
    return g_drvHandle != INVALID_HANDLE_VALUE;
}

void ldf::drv::Close() {
    if (g_drvHandle != INVALID_HANDLE_VALUE) {
        CloseHandle(g_drvHandle);
        g_drvHandle = INVALID_HANDLE_VALUE;
    }
}

bool ldf::drv::Call(uint32_t code, const void* in, uint32_t inSize,
                    void* out, uint32_t outSize) {
    if (g_drvHandle == INVALID_HANDLE_VALUE) return false;
    DWORD got = 0;
    return !!DeviceIoControl(g_drvHandle, code,
        const_cast<void*>(in), inSize, out, outSize, &got, nullptr);
}

static volatile bool g_uninstallRequested = false;

void RequestUninstall() {
    constexpr uint32_t IOCTL_UNINSTALL = 0xE7E8;
    ldf::drv::Call(IOCTL_UNINSTALL, nullptr, 0, nullptr, 0);
    g_uninstallRequested = true;
}

// ---- D3D11 plumbing -------------------------------------------------------

static ID3D11Device*            g_pd3dDevice = nullptr;
static ID3D11DeviceContext*     g_pd3dDeviceContext = nullptr;
static IDXGISwapChain*          g_pSwapChain = nullptr;
static ID3D11RenderTargetView*  g_mainRTV = nullptr;

static bool CreateDeviceD3D(HWND hWnd) {
    DXGI_SWAP_CHAIN_DESC sd = {};
    sd.BufferCount = 2;
    sd.BufferDesc.Width  = 0;
    sd.BufferDesc.Height = 0;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = hWnd;
    sd.SampleDesc.Count = 1;
    sd.Windowed = TRUE;
    sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;

    const D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_0 };
    HRESULT hr = D3D11CreateDeviceAndSwapChain(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 1, D3D11_SDK_VERSION,
        &sd, &g_pSwapChain, &g_pd3dDevice, nullptr, &g_pd3dDeviceContext);
    if (FAILED(hr)) return false;

    ID3D11Texture2D* back = nullptr;
    g_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&back));
    g_pd3dDevice->CreateRenderTargetView(back, nullptr, &g_mainRTV);
    back->Release();
    return true;
}

static void CleanupDeviceD3D() {
    if (g_mainRTV)          { g_mainRTV->Release();          g_mainRTV = nullptr; }
    if (g_pSwapChain)       { g_pSwapChain->Release();       g_pSwapChain = nullptr; }
    if (g_pd3dDeviceContext){ g_pd3dDeviceContext->Release();g_pd3dDeviceContext = nullptr; }
    if (g_pd3dDevice)       { g_pd3dDevice->Release();       g_pd3dDevice = nullptr; }
}

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND, UINT, WPARAM, LPARAM);

static LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (ImGui_ImplWin32_WndProcHandler(hWnd, msg, wParam, lParam)) return true;
    switch (msg) {
        case WM_SIZE:
            if (g_pd3dDevice && wParam != SIZE_MINIMIZED) {
                if (g_mainRTV) { g_mainRTV->Release(); g_mainRTV = nullptr; }
                g_pSwapChain->ResizeBuffers(0,
                    static_cast<UINT>(LOWORD(lParam)),
                    static_cast<UINT>(HIWORD(lParam)),
                    DXGI_FORMAT_UNKNOWN, 0);
                ID3D11Texture2D* back = nullptr;
                g_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&back));
                g_pd3dDevice->CreateRenderTargetView(back, nullptr, &g_mainRTV);
                back->Release();
            }
            return 0;
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProc(hWnd, msg, wParam, lParam);
}

static HWND CreateOverlayWindow(HINSTANCE hInst) {
    WNDCLASSEXW wc = { sizeof(wc), CS_CLASSDC, WndProc, 0, 0, hInst,
        nullptr, nullptr, nullptr, nullptr, L"LDF_OVERLAY", nullptr };
    RegisterClassExW(&wc);

    int sw = GetSystemMetrics(SM_CXSCREEN);
    int sh = GetSystemMetrics(SM_CYSCREEN);
    HWND hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST |
        WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        wc.lpszClassName, L"LDF FN Private",
        WS_POPUP, 0, 0, sw, sh,
        nullptr, nullptr, hInst, nullptr);

    // Click-through until the menu opens; UI frame flips this back and forth.
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);

    MARGINS m = { -1, -1, -1, -1 };
    DwmExtendFrameIntoClientArea(hwnd, &m);

    return hwnd;
}

static bool KeyPressedOnce(uint32_t vk) {
    static bool held[256] = {};
    if (vk >= 256) return false;
    bool now = (GetAsyncKeyState(static_cast<int>(vk)) & 0x8000) != 0;
    bool edge = now && !held[vk];
    held[vk] = now;
    return edge;
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE, LPSTR, int) {
    HWND hwnd = CreateOverlayWindow(hInst);
    if (!CreateDeviceD3D(hwnd)) {
        CleanupDeviceD3D();
        return 1;
    }
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);

    if (ldf::GetConfig().streamProof) {
        // Vanishes from OBS, Discord screenshare, screenshots.
        SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    }

    g_driverReachable = ldf::drv::Open();

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.IniFilename = nullptr;

    ldf::glass::ApplyStyle();

    ImGui_ImplWin32_Init(hwnd);
    ImGui_ImplDX11_Init(g_pd3dDevice, g_pd3dDeviceContext);

    // Try to pick up the last saved config.
    ldf::LoadConfig(nullptr);

    bool menuOpen = true;
    bool running = true;

    while (running) {
        MSG msg;
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
            if (msg.message == WM_QUIT) running = false;
        }
        if (!running || g_uninstallRequested) break;

        auto& c = ldf::GetConfig();

        if (KeyPressedOnce(c.menuKey)) menuOpen = !menuOpen;
        if (KeyPressedOnce(c.unloadKey)) {
            RequestUninstall();
            break;
        }

        // Toggle click-through so the menu can take input but the game keeps
        // mouse input while the menu is closed.
        LONG ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if (menuOpen) ex &= ~WS_EX_TRANSPARENT;
        else          ex |=  WS_EX_TRANSPARENT;
        SetWindowLongW(hwnd, GWL_EXSTYLE, ex);

        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        ldf::ui::DrawMenu(&menuOpen);

        // ESP/aimbot drawing hooks into DrawListForeground.
        // extern void RenderESP(ImDrawList*);
        // RenderESP(ImGui::GetForegroundDrawList());

        ImGui::Render();
        const float clear[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
        g_pd3dDeviceContext->OMSetRenderTargets(1, &g_mainRTV, nullptr);
        g_pd3dDeviceContext->ClearRenderTargetView(g_mainRTV, clear);
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

        g_pSwapChain->Present(1, 0);
    }

    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    CleanupDeviceD3D();
    DestroyWindow(hwnd);
    UnregisterClassW(L"LDF_OVERLAY", hInst);
    ldf::drv::Close();
    return 0;
}
