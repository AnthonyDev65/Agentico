@echo off
REM Lanzador de Agentico IDE en modo desarrollo.
REM Activa el entorno de MSVC Build Tools 2022 (para que Rust use el linker
REM correcto, no el VS 18 incompleto) y arranca Tauri.

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo [dev.cmd] No se pudo activar vcvars64.bat de Build Tools 2022.
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0"

echo [dev.cmd] Entorno MSVC activo. Arrancando Tauri...
pnpm tauri dev
