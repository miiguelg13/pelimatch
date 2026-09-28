@echo off
REM ======================================================================
REM  Encarga el APK de Pelimatch a los servidores de Expo (EAS Build).
REM  Necesitas una cuenta gratis en https://expo.dev/signup
REM  Al terminar te da un enlace para descargar el APK en los dos moviles.
REM ======================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  No encuentro Node.js. Instalalo desde https://nodejs.org (version LTS^) y vuelve a probar.
  pause
  exit /b 1
)
echo.
for /f "delims=" %%u in ('node -p "require('./app.json').expo.extra.apiUrl"') do set "API=%%u"
echo  La app hablara con el servidor: %API%
echo  (si no es la direccion de tu servicio de Render, cierra esta ventana y corrigela en app.json^)
echo.
pause
echo.
echo  [1/2] Sesion de Expo (si no la tienes, te pide usuario y contrasena de expo.dev^)...
call npx -y eas-cli@latest whoami >nul 2>&1
if errorlevel 1 call npx -y eas-cli@latest login
if errorlevel 1 (
  echo  No se pudo iniciar sesion en Expo.
  pause
  exit /b 1
)
echo.
echo  [2/2] Encargando el APK (la primera vez pregunta si crear el proyecto en Expo: responde Y^)...
call npx -y eas-cli@latest build -p android --profile preview
echo.
echo  Si ha ido bien, arriba tienes el enlace del APK. Abrelo en los dos moviles para instalarlo.
pause
