@echo off
REM Sube a GitHub los commits nuevos de main (lo lanza la tarea de Windows cada hora).
REM Nunca pide contrasena: si la sesion de GitHub caduco, vuelve a ejecutar conectar-github.bat.
setlocal
cd /d "%~dp0..\.."
if not exist logs mkdir logs
set GCM_INTERACTIVE=never
set GIT_TERMINAL_PROMPT=0
for /f %%s in ('git rev-list --count origin/main..main 2^>nul') do set "NUEVOS=%%s"
if "%NUEVOS%"=="0" exit /b 0
echo ==== %date% %time% ==== >> logs\subida-github.log
git push origin main >> logs\subida-github.log 2>&1
