# Desplegar Pelimatch

Todo es gratis. Tres piezas: el código en **GitHub**, el servidor en **Render** con la base de datos en **MongoDB Atlas**, y la app como **APK** para instalar en los dos Android.

Los datos secretos (la contraseña de la base de datos y el token de TMDB) **solo se escriben en el panel de Render**. Nunca van al repositorio ni al chat.

## 1. Subir el código a GitHub

Doble clic en **`conectar-github.bat`**:

1. Nombre del repositorio: Enter para `pelimatch`.
2. Visibilidad: Enter para **público** (se ve en tu perfil, para el porfolio) o escribe `privado`.
3. Si Git no tiene tu sesión de GitHub, se abre el navegador para iniciarla. El script no ve tu contraseña.
4. Crea la tarea de Windows **"Pelimatch - subir a GitHub"**, que cada hora sube los commits nuevos (registro en `logs/subida-github.log`).

## 2. Token de TMDB

En [themoviedb.org](https://www.themoviedb.org/settings/api) → *Settings → API*, copia el **API Read Access Token** (el largo, empieza por `eyJ`). Lo pegarás en Render en el paso 4.

## 3. Base de datos: la misma de Codle, otra base

Atlas solo deja un clúster gratis por proyecto, así que Pelimatch usa el de Codle con otra base de datos (`pelimatch`):

1. En [Render](https://dashboard.render.com) abre el servicio de **Codle** → *Environment* → copia el valor de `MONGODB_URI`.
2. Cambia el nombre de la base, lo que va entre `.mongodb.net/` y `?`, por `pelimatch`:
   `mongodb+srv://usuario:contraseña@cluster.xxxxx.mongodb.net/pelimatch?retryWrites=true&w=majority`
   (si no hay nada entre `/` y `?`, añade `pelimatch` ahí).

## 4. Servidor en Render

1. Render → **New → Blueprint** → elige el repositorio `pelimatch`. Lee `render.yaml` y propone el servicio `pelimatch` (Frankfurt, plan Free).
2. Te pide dos valores:
   - `MONGODB_URI`: la del paso 3.
   - `TMDB_TOKEN`: el del paso 2.
3. **Apply**. El primer despliegue tarda unos minutos. Cuando termine, abre `https://<tu-servicio>.onrender.com/api/health`: debe responder `{"ok":true}`.
4. Apunta la dirección del servicio (no es secreta): va en `expo.extra.apiUrl` de `app/app.json` antes de crear el APK.

El plan gratis se duerme tras 15 minutos sin uso; la primera vez que abráis la app puede tardar un minuto en despertar (la app avisa).

## 5. El APK

Cuando la app ya tenga la dirección de Render:

1. Crea una cuenta gratis en [expo.dev](https://expo.dev/signup).
2. Doble clic en `app\crear-apk.bat`: comprueba la dirección del servidor, inicia sesión en Expo y encarga el APK a los servidores de Expo (~10–15 min).
3. La primera vez crea el proyecto en expo.dev y activa las **actualizaciones sin reinstalar** (EAS Update). Si pregunta, responde `Y` (también al keystore de Android: Expo lo guarda por ti).
4. Al terminar te da un enlace: ábrelo en los dos móviles, descarga el APK e instálalo (Android pedirá permitir *instalar apps de origen desconocido*).

## 6. Actualizar la app

- **Servidor**: cada commit que llega a GitHub lo redespliega Render solo.
- **Pantallas, textos, diseño**: doble clic en `app\publicar-actualizacion.bat`. Al abrir la app, los móviles bajan la versión nueva y enseñan «Hay una versión nueva · Reiniciar». No hace falta reinstalar.
- **Cambios nativos** (un permiso nuevo, un módulo con código nativo): hay que subir `version` en `app/app.json` y hacer un APK nuevo con `crear-apk.bat`. Las actualizaciones solo llegan a los APK con la misma `version`.
