# ADR: Pin de `whatsapp-web.js` a fork con fix `$1 → _serialized` (rotura WA Web julio 2026)

- **Author:** Luciano Bustos
- **Updated:** 2026-07-25
- **ETR:** 5 min

## Tabla de contenidos

- [Contexto](#contexto)
- [Síntomas observados](#síntomas-observados)
- [Causa raíz](#causa-raíz)
- [Decisión](#decisión)
- [Cambios aplicados](#cambios-aplicados)
- [Alternativas consideradas](#alternativas-consideradas)
- [Consecuencias y riesgos](#consecuencias-y-riesgos)
- [Rollback](#rollback)
- [Plan de salida (exit criteria)](#plan-de-salida-exit-criteria)
- [Referencias](#referencias)

## Contexto

El update de WhatsApp Web de julio 2026 (`2.3000.1043xxx`) renombró internamente la propiedad de IDs serializados `_serialized` → `$1`. Esto rompió `whatsapp-web.js@1.34.7` (última release oficial a la fecha) de forma transversal: todos los code paths que leen `id._serialized` en los evaluates del browser fallan.

OpenWA usa `whatsapp-web.js` como engine vía `WhatsAppWebJsAdapter`, por lo que la API quedó parcialmente inoperativa aun con la sesión autenticada y `ready`.

## Síntomas observados

Logs del contenedor `openwa-api` (2026-07-25, sesión `chancletazo-prod`):

| Endpoint / flujo | Error | Stack relevante |
|---|---|---|
| `GET groups` → `SessionService.getGroups` | `r: r` (error minificado de WA Web) | `Client.getChats` → `puppeteer ExecutionContext.evaluate` |
| `POST message` → `MessageService.sendText` | `TypeError: Cannot read properties of undefined (reading 'id')` | `whatsapp-web-js.adapter.js:279` (compilado) — en TS: `sendTextMessage`, `msg.id._serialized` |

La conexión y el QR funcionan normalmente (`Session ready`), lo que confirma que la rotura es en la capa de interacción con el Store de WA Web, no en auth/puppeteer.

## Causa raíz

- `client.sendMessage()` devuelve `undefined` porque la serialización del mensaje en el browser falla al no existir `_serialized`.
- `client.getChats()` lanza `r: r` (excepción minificada) por la misma razón al mapear los modelos de chat.
- Upstream trackea la rotura en los issues [#201838](https://github.com/wwebjs/whatsapp-web.js/issues/201838) y [#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849). El fix comunitario es el PR [#201832](https://github.com/wwebjs/whatsapp-web.js/pull/201832): agrega `Base._normalizeId()` (copia `$1` → `_serialized`) y fallbacks `|| .$1` en los evaluates.

## Decisión

Pinear `whatsapp-web.js` al commit del fork del PR #201832 hasta que exista release oficial upstream:

```json
"whatsapp-web.js": "github:lindionez/whatsapp-web.js#f4ea1e3cf4076e44e36dfe5f81ea57048d2f7761"
```

- Commit `f4ea1e3` = HEAD de la branch `feat/fix-_serialized-id-fallback` (verificado vía `git ls-remote` el 2026-07-25).
- Se pinea **por SHA** (no por branch) para builds reproducibles en Docker.

## Cambios aplicados

1. **`package.json`**: dependencia `whatsapp-web.js` `^1.34.7` → `github:lindionez/whatsapp-web.js#f4ea1e3...`.
2. **`package-lock.json`**: regenerado (`npm install --package-lock-only`). Diff limitado a la entrada de `whatsapp-web.js` (2 entradas del lock).
3. **`Dockerfile`**: se agrega `git` a los `apt-get install` de ambos stages (builder y production), requerido por `npm ci` para resolver dependencias git de GitHub.

Sin cambios de código en `WhatsAppWebJsAdapter`.

## Alternativas consideradas

| Alternativa | Veredicto |
|---|---|
| Esperar release oficial | ❌ API caída indefinidamente; PR sin merge al 2026-07-25 |
| `webVersionCache` pin a WA Web viejo | ❌ Poco confiable: WA fuerza upgrades server-side; el HTML cacheado no garantiza el Store viejo |
| Guard defensivo en el adapter (`if (!msg) throw`) | ❌ Solo mejora el mensaje de error, no restaura funcionalidad |
| Tarball `codeload.github.com` en vez de dep git | ⚠️ Equivalente; se descartó solo por preferir el spec `github:` canónico (el lock igual permite fallback a tarball) |

## Consecuencias y riesgos

- ✅ Restaura `sendMessage`, `getChats`/`getGroups` y paths derivados (reactions, polls, media, quoted).
- ⚠️ **Mensajes a grupos**: reportes upstream ([#201849](https://github.com/wwebjs/whatsapp-web.js/issues/201849)) de "Waiting for this message" en el teléfono primario del emisor incluso con el fix. Verificar tras el deploy; los destinatarios sí reciben.
- ⚠️ Dependencia de un fork de tercero: el SHA pineado es inmutable, pero conviene migrar a upstream apenas haya release.
- ⚠️ `npm audit`/Dependabot no seguirán la dep git.

## Rollback

```bash
# package.json: volver a "whatsapp-web.js": "^1.34.7"
npm install --package-lock-only
docker compose build --no-cache openwa-api && docker compose up -d
```

(El rollback reintroduce la rotura mientras WA Web siga en `2.3000.1043xxx`.)

## Plan de salida (exit criteria)

Quitar el pin cuando **cualquiera** de estas se cumpla:

1. Release oficial de `whatsapp-web.js` > 1.34.7 con el fix (`_serialized`/`$1`) — revisar [releases](https://github.com/wwebjs/whatsapp-web.js/releases).
2. Merge del PR #201832 a `main` y publicación en npm.

## Referencias

- [Issue #201838 — `r: r` en getChatById/getChats](https://github.com/wwebjs/whatsapp-web.js/issues/201838)
- [Issue #201849 — grupos "Waiting for this message"](https://github.com/wwebjs/whatsapp-web.js/issues/201849)
- [PR #201832 — fallback `$1 → _serialized`](https://github.com/wwebjs/whatsapp-web.js/pull/201832)
- Fork pineado: [lindionez/whatsapp-web.js@f4ea1e3](https://github.com/lindionez/whatsapp-web.js/tree/f4ea1e3cf4076e44e36dfe5f81ea57048d2f7761)
