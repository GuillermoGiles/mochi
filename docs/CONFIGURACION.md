# Configuración

Pasos para poner Mochi a andar con tu propia cuenta de Google. Lo que hace la app está en el [README](../README.md).

**Publicar cambios:** todo lo que se sube a la rama `main` de GitHub se publica solo en Vercel.

## Configurar Google (una sola vez)

1. Entrá a <https://console.cloud.google.com> con tu cuenta de Gmail.
2. Arriba a la izquierda: **Seleccionar proyecto → Proyecto nuevo**. Nombre: `Facu`. Crear.
3. Buscá **Google Drive API** en la barra de búsqueda y tocá **Habilitar**.
4. Andá a **Google Auth Platform** (o "Pantalla de consentimiento de OAuth") → **Comenzar**:
   - Nombre de la app: `Facu`. Correo de asistencia: el tuyo.
   - Público: **Externo**.
   - Datos de contacto: tu correo. Aceptá y **Crear**.
5. En **Acceso a los datos** → **Agregar o quitar permisos**, buscá
   `.../auth/drive.file`, marcalo y guardá.
6. En **Público** tocá **Publicar app** (así la sesión no se cierra cada 7 días).
   No hace falta verificación porque el permiso `drive.file` es básico.
7. En **Clientes** → **Crear cliente**:
   - Tipo: **Aplicación web**. Nombre: `Facu`.
   - URIs de redireccionamiento autorizados: `http://localhost:5173/api/callback`
     (más adelante se agrega también la dirección de internet).
   - Crear. Copiá el **ID de cliente** y el **Secreto del cliente**.
8. Abrí el archivo `.env.local` de esta carpeta y pegalos:

   ```
   GOOGLE_CLIENT_ID=lo-que-copiaste.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-lo-que-copiaste
   SESSION_SECRET=(ya está completo, no lo toques)
   ```

## Clave de API (para compartir apuntes)

Para que un compañero pueda recibir una carpeta compartida, Mochi necesita una clave de API:

1. En <https://console.cloud.google.com/apis/credentials?project=facu-511514> tocá **Crear credenciales → Clave de API**.
2. En la clave nueva, **Restricciones de aplicación → Sitios web**, agregá `https://mochi-facu.vercel.app/*` y `http://localhost:5173/*`.
3. En **Restricciones de API**, elegí **Google Drive API**. Guardá.
4. Pegala en `.env.local` como `VITE_GOOGLE_API_KEY=...` (y en Vercel, en las variables del proyecto).

## Avisos de parciales y entregas (una sola vez)

Para mandar notificaciones con la app cerrada hace falta una base de datos chica y unas claves.

1. **Base de datos:** en Vercel, el proyecto → **Storage** → **Create Database** → **Upstash for Redis** (plan gratis) → conectala al proyecto. Vercel agrega solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
2. **Claves de los avisos:** en la compu, `npx web-push generate-vapid-keys` y cargá en Vercel (Settings → Environment Variables):
   - `VAPID_PUBLIC_KEY` = la clave pública
   - `VAPID_PRIVATE_KEY` = la clave privada (no la compartas)
3. **Tarea diaria:** cargá `CRON_SECRET` con cualquier texto largo y aleatorio. Vercel lo usa para llamar a `/api/cron-avisos` todas las mañanas (8 h de Argentina, ver `crons` en `vercel.json`; en el plan gratis puede llegar dentro de esa hora).
4. Volvé a publicar (Deployments → Redeploy) para que tome las variables.

Si cambiás las claves de los avisos, cada uno tiene que volver a activarlos en Vos.

## Usarla en la compu

```
npm run dev
```

y abrí <http://localhost:5173>.

## Cosas para saber

- Lo que borres va a la **papelera de Google Drive** y se puede recuperar durante 30 días.
- La app solo ve los archivos que subiste desde la app, no el resto de tu Drive.
- Las fechas, notas, entregas y el avance de la carrera están en el archivo `Mochi - fechas.json` de la carpeta Facultad. No lo borres.
- Para probar la app sin cuenta: `npm run dev` y abrí <http://localhost:5173/?demo> (datos de prueba, solo en la compu).
