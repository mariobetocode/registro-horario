# Registro de Horarios — Guía de instalación

## Qué necesitas
- Cuenta en **GitHub** (gratis) → github.com
- Cuenta en **Supabase** (gratis) → supabase.com
- Cuenta en **Vercel** (gratis) → vercel.com

---

## Paso 1 — Crear la base de datos en Supabase

1. Entra a **supabase.com** → "Start your project" → crea una cuenta gratuita
2. Crea un nuevo proyecto (ponle el nombre que quieras, ej. "registro-horario")
3. Espera ~2 minutos a que se cree
4. Ve a **SQL Editor** (menú izquierdo) → "New query"
5. Copia y pega el contenido de `supabase_setup.sql` → clic en "Run"
6. Ve a **Settings → API** y copia:
   - **Project URL** (algo como `https://abcdef.supabase.co`)
   - **anon public** key (cadena larga)

---

## Paso 2 — Subir el código a GitHub

1. Entra a **github.com** → "New repository"
2. Nómbralo `registro-horario` → "Create repository"
3. Sube todos los archivos de esta carpeta al repositorio
   - Si no sabes usar Git, usa la opción "uploading an existing file" en GitHub

---

## Paso 3 — Conectar con Vercel

1. Entra a **vercel.com** → "Continue with GitHub"
2. Clic en "Add New Project" → selecciona el repositorio `registro-horario`
3. Antes de hacer deploy, en la sección **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = la URL de tu proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` = la anon key de Supabase
4. Clic en **Deploy** — espera ~1 minuto

¡Listo! Vercel te dará una URL como `registro-horario.vercel.app`

---

## Paso 4 — Instalar como app en tu iPhone/iPad

1. Abre Safari y entra a tu URL de Vercel
2. Toca el botón de compartir (□↑)
3. Selecciona **"Añadir a pantalla de inicio"**
4. Toca "Añadir"

Ya aparecerá como una app en tu pantalla de inicio. En la laptop puedes hacer lo mismo desde Chrome → ícono de instalar en la barra de direcciones.

---

## Actualizaciones futuras

Si quieres modificar algo en la app, edita los archivos en GitHub y Vercel re-deployará automáticamente en segundos.
