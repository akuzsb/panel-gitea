# Panel de actividad Gitea

Panel web sencillo en Node.js + Express para visualizar un resumen de la actividad reciente de usuarios y repositorios en una instancia de Gitea.

## Requisitos

- Node.js 18 o superior
- Variables de entorno disponibles en `.env`:
  - `URL_GITEA_HOST` (incluyendo protocolo, por ejemplo `http://mi-gitea.local`)
  - `URL_GITEA_PORT`
  - `URL_GITEA_API_KEY` (token con permisos de lectura sobre los repositorios que quieras analizar)
  - `BASE_PATH` (opcional, prefijo bajo el que se sirve la app; por defecto `/`. Úsalo, por ejemplo, `/gitea` si publicas detrás de Nginx Proxy Manager en ese sub-path)

## Puesta en marcha

```cmd
npm install
npm run start
```

Por defecto el servidor expone la aplicación en `http://localhost:4040`. Puedes modificar el puerto con la variable `PORT`.

## ¿Qué calcula?

Perfiles de usuario (vista principal):

- Commits realizados en el periodo (1, 7, 15 o 30 días)
- Líneas modificadas (suma de adiciones y eliminaciones)
- Número de repositorios distintos donde participó
- Fecha y hora de la última actividad detectada

Repositorios (segunda vista):

- Total de commits en el periodo
- Líneas modificadas
- Número de colaboradores únicos
- Última actividad detectada

Además puedes exportar ambas vistas a un archivo Excel desde cualquiera de las páginas.

## Notas

- Se consulta la lista de repositorios accesibles vía `GET /repos/search` y luego se agregan los commits de cada repositorio.
- Las peticiones a Gitea se realizan en paralelo con un límite de concurrencia para no saturar el servidor.
- Si algunas métricas aparecen vacías, revisa que el token tenga acceso a los repositorios y que la versión de Gitea exponga las estadísticas de commits (`stat=true`).
- El endpoint `/api/stats/export` genera un Excel con pestañas para usuarios y repositorios usando la misma información mostrada en el panel.
- El panel permite elegir entre analizar solo la rama por defecto (opción recomendada por rendimiento) o todas las ramas de cada repositorio.
