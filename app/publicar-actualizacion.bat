@echo off
REM ======================================================================
REM  Publica una actualizacion de la app de Pelimatch (EAS Update): los
REM  moviles la bajan solos al abrir la app, sin reinstalar el APK.
REM  Solo para cambios de pantallas, textos o diseno. Si cambia algo nativo
REM  (permisos, modulos nuevos), hay que subir "version" en app.json y
REM  hacer un APK nuevo con crear-apk.bat.
REM ======================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
findstr /c:"u.expo.dev" app.json >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Aun no hay proyecto de Expo: primero crea el APK con crear-apk.bat.
  pause
  exit /b 1
)
REM Un .env de pruebas meteria la IP de tu PC en la actualizacion y los moviles no llegarian a Render.
if exist .env (
  echo.
  echo  Hay un fichero app\.env (el de pruebas en local^). Renombralo o borralo antes de publicar:
  echo  si no, los moviles intentarian hablar con tu PC en vez de con el servidor de Render.
  pause
  exit /b 1
)
echo.
echo  [1/2] Comprobando las dependencias...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo  Fallo la instalacion de dependencias.
  pause
  exit /b 1
)
echo.
set "MSG=Mejoras"
set /p "MSG=  Que cambia en esta version? [Mejoras]: "
echo.
echo  [2/2] Publicando...
call npx -y eas-cli@latest update --channel preview --environment preview --platform android --message "%MSG%"
if errorlevel 1 (
  echo.
  echo  La publicacion ha fallado.
  pause
  exit /b 1
)
echo.
echo  Listo. Al abrir la app, los moviles bajaran la version nueva y ofreceran reiniciar.
pause
