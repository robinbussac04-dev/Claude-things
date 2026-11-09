cmake_minimum_required(VERSION 3.20)
project(LDFOverlay LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT WIN32)
    message(FATAL_ERROR "LDF overlay is Windows-only (Win32 + D3D11).")
endif()

# Dear ImGui sources — drop the imgui tree under Overlay/third_party/imgui.
set(IMGUI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui")

if(NOT EXISTS "${IMGUI_DIR}/imgui.cpp")
    message(FATAL_ERROR "Place Dear ImGui at Overlay/third_party/imgui (imgui.cpp + backends/)")
endif()

add_executable(Overlay WIN32
    main.cpp
    Config.cpp
    Config.h
    GlassTheme.cpp
    GlassTheme.h
    UI.cpp
    UI.h

    ${IMGUI_DIR}/imgui.cpp
    ${IMGUI_DIR}/imgui_draw.cpp
    ${IMGUI_DIR}/imgui_tables.cpp
    ${IMGUI_DIR}/imgui_widgets.cpp
    ${IMGUI_DIR}/backends/imgui_impl_win32.cpp
    ${IMGUI_DIR}/backends/imgui_impl_dx11.cpp
)

target_include_directories(Overlay PRIVATE
    ${IMGUI_DIR}
    ${IMGUI_DIR}/backends
)

target_compile_definitions(Overlay PRIVATE
    UNICODE _UNICODE
    WIN32_LEAN_AND_MEAN NOMINMAX
)

target_compile_options(Overlay PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4 /permissive- /Zc:preprocessor>
)

target_link_libraries(Overlay PRIVATE
    d3d11
    dxgi
    dwmapi
    Shell32
    Ole32
    User32
)

set_target_properties(Overlay PROPERTIES
    OUTPUT_NAME "Overlay"
    VS_DPI_AWARE "PerMonitor"
)
