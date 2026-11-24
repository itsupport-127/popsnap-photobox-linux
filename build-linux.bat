@echo off
rem Build paket Linux POPSNAP (.deb + .tar.gz) dari Windows. Hasil: linux\dist\
rem   build-linux.bat           versi dari electron\package.json
rem   build-linux.bat 1.1.0     versi tertentu
rem Butuh Docker Desktop (disarankan) ATAU WSL (Ubuntu) yang sudah ada Node 22.5+ dan dpkg-deb.
setlocal
cd /d "%~dp0"
set VER=%1

where docker >nul 2>nul
if %errorlevel%==0 (
  docker info >nul 2>nul
  if not errorlevel 1 (
    echo == Build lewat Docker ^(node:22-bookworm^)
    docker run --rm -v "%cd%":/src -e SRC=/src node:22-bookworm sh -c "tr -d '\r' < /src/linux/build-clean.sh | sh -s -- %VER%"
    goto :done
  )
  echo Docker terpasang tapi belum jalan. Buka Docker Desktop dulu, atau pakai WSL.
)

where wsl >nul 2>nul
if %errorlevel%==0 (
  echo == Build lewat WSL ^(butuh Node 22.5+ dan dpkg-deb di dalam WSL^)
  for /f "usebackq delims=" %%i in (`wsl wslpath -a "%cd%"`) do set WSLDIR=%%i
  wsl env SRC="%WSLDIR%" sh -c "tr -d '\r' < \"$SRC/linux/build-clean.sh\" | sh -s -- %VER%"
  goto :done
)

echo Tidak ada Docker maupun WSL. Pasang Docker Desktop ^(https://www.docker.com/products/docker-desktop^) lalu jalankan lagi.
exit /b 1

:done
if errorlevel 1 ( echo. & echo BUILD GAGAL, lihat pesan di atas. & exit /b 1 )
echo.
echo Selesai. Cek folder linux\dist\
dir linux\dist
