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
echo  [1/4] Instalando las dependencias de la app (la primera vez tarda un par de minutos^)...
if not exist node_modules\expo-router (
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)
echo.
echo  [2/4] Sesion de Expo (si no la tienes, te pide usuario y contrasena de expo.dev^)...
call npx -y eas-cli@latest whoami >nul 2>&1
if errorlevel 1 call npx -y eas-cli@latest login
if errorlevel 1 (
  echo  No se pudo iniciar sesion en Expo.
  pause
  exit /b 1
)
echo.
REM La primera vez: crea el proyecto en expo.dev y activa las actualizaciones sin reinstalar.
findstr /c:"u.expo.dev" app.json >nul 2>&1
if errorlevel 1 (
  echo  [3/4] Creando el proyecto en expo.dev y activando las actualizaciones (si pregunta, responde Y^)...
  call npx -y eas-cli@latest update:configure --platform android
  if errorlevel 1 (
    echo.
    echo  No se pudo configurar el proyecto en Expo.
    pause
    exit /b 1
  )
  REM Guarda en git el identificador del proyecto (se sube a GitHub con la tarea de cada hora^).
  git add app.json eas.json >nul 2>&1
  git commit -m "App: proyecto de Expo y actualizaciones (EAS Update)" >nul 2>&1
)
echo.
echo  [4/4] Encargando el APK (si pregunta por el keystore de Android, responde Y^)...
call npx -y eas-cli@latest build -p android --profile preview
if errorlevel 1 (
  echo.
  echo  El encargo del APK ha fallado.
  pause
  exit /b 1
)
echo.
echo  Listo: arriba tienes el enlace del APK. Abrelo en los dos moviles para instalarlo.
pause
