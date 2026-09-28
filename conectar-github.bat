@echo off
REM ======================================================================
REM  Sube Pelimatch a un repositorio de tu GitHub y deja una tarea de
REM  Windows que sube los cambios nuevos cada hora.
REM  Ejecutar una vez (doble clic). Se puede repetir sin problema.
REM ======================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo  No encuentro git. Instala Git for Windows: https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)
echo.
set "REPO=pelimatch"
set /p "REPO=  Nombre del repositorio en GitHub [pelimatch]: "
set "VIS=publico"
set /p "VIS=  Visibilidad: publico (para tu porfolio) o privado [publico]: "
echo.
python tools\github\conectar.py "%REPO%" "%VIS%"
if errorlevel 9009 py -3 tools\github\conectar.py "%REPO%" "%VIS%"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
set "VBS=%~dp0tools\github\subir-github-oculto.vbs"
schtasks /Create /TN "Pelimatch - subir a GitHub" /TR "wscript.exe \"%VBS%\"" /SC HOURLY /F >nul
if errorlevel 1 (
  echo.
  echo  El codigo ya esta en GitHub, pero no se pudo crear la tarea de cada hora.
) else (
  echo  Tarea "Pelimatch - subir a GitHub" creada: cada hora sube los cambios nuevos.
  echo  Registro: logs\subida-github.log
)
echo.
pause
