# Session-Erkenntnisse: MentraOS TPA Server Migration

**Datum:** 17. Oktober 2025  
**Projekt:** mentraOSPush (GitHub Webhook → MentraOS G1 Glasses)

---

## 1. Was wurde gemacht

### Zielsetzung
- **Anforderung:** Migration einer bestehenden Azure Function App zu einem MentraOS TPA (Third-Party App) Server
- **Hauptziel:** GitHub Webhooks empfangen und als Reference Cards an MentraOS G1 Brillen senden
- **Lifecycle-Anforderung:** MentraOS AppServer/TPA Lifecycle-Konzept übernehmen (basierend auf MentraOS SDK Beispiel)

### Implementierte Lösung
1. **Komplette Neustrukturierung:**
   - Entfernung aller Azure Functions-Abhängigkeiten (`host.json`, Function-spezifische Struktur)
   - Migration von `local.settings.json` → `.env` für Umgebungsvariablen
   - Umbau zu einer minimalen, standalone Express + MentraOS TPA App

2. **Neue Architektur:**
   - **Single-File-Server:** `app.js` (root) — komplette TPA-Implementierung in einer Datei
   - **Klasse:** `GitHubMentraOSApp extends TpaServer` (MentraOS SDK)
   - **Session Management:** In-Memory Map (`this.activeSessions`) für aktive MentraOS-Sessions

3. **Implementierte Features:**
   - **Session Lifecycle:**
     - `onSession(session, sessionId, userId)` — registriert neue Sessions
     - `onDisconnected` Handler — entfernt Sessions bei Disconnect
     - Welcome Message via `session.layouts.showTextWall()`
   
   - **GitHub Webhook Endpoints:**
     - `POST /github` — **Broadcast** zu allen aktiven Sessions (Hauptfunktion)
     - `POST /github/:sessionId` — Legacy per-Session Delivery
     - HMAC SHA-256 Signatur-Verifizierung (`X-Hub-Signature-256`)
   
   - **Test & Monitoring:**
     - `GET /status` — JSON mit aktivem Server-Status, Package, Port, aktive Sessions
     - `POST /test/:sessionId` — Sendet Test Reference Card
     - `GET /dashboard` — Embedded HTML Dashboard
   
   - **MentraOS SDK Webhook:**
     - `/webhook` — automatisch von `TpaServer` bereitgestellt (SDK managed)

4. **GitHub Event Formatting:**
   - Inline-Formatter für GitHub Events → Reference Cards
   - Unterstützte Events: push, pull_request, issues, pull_request_review, etc.
   - Formatierung mit Emojis und strukturiertem Text

---

## 2. Probleme & Fehler (chronologisch)

### Problem 1: Falsche SDK-Klasse
**Fehler:**
```
Class extends value undefined is not a constructor or null
```
**Ursache:** Code verwendete `AppServer` (existiert nicht im SDK)  
**Lösung:** Umstellung auf `TpaServer` (korrekte SDK-Klasse aus `@mentra/sdk/dist/tpa`)

---

### Problem 2: Umgebungsvariablen nicht geladen
**Fehler:** API Key und andere `.env` Variablen wurden nicht erkannt  
**Ursache:** Node.js lädt `.env` nicht automatisch  
**Lösung:** 
- Installation: `npm install dotenv`
- Code: `require('dotenv').config()` am Anfang von `app.js`

---

### Problem 3: Layout API Signatur falsch
**Fehler:**
```
❌ Fehler: ReferenceCard layout must have a title property
```
**Ursache:** Falscher Aufruf von `showReferenceCard` (Objekt übergeben statt einzelner Parameter)

**Falsch:**
```javascript
session.layouts.showReferenceCard({
  title: "Test",
  text: "...",
  durationMs: 10000
});
```

**Richtig:**
```javascript
session.layouts.showReferenceCard(
  "Test",           // title (string)
  "...",           // text (string)
  { durationMs: 10000 }  // options (object)
);
```

**Lösung:** Alle `showReferenceCard` Aufrufe korrigiert auf `(title, text, options)`

---

### Problem 4: Nicht-existierende Event Handler
**Fehler:**
```
session.events.onUserInteraction is not a function
```
**Ursache:** SDK-Version exponiert `session.events.onUserInteraction` nicht  
**Lösung:** Handler auskommentiert/entfernt (derzeit nicht benötigt)

---

### Problem 5: Broadcast ohne Session-ID
**Anforderung:** "Der GitHub Webhook sollte auf alle registrierte Brillen gesendet werden, da ich die Session ID nicht kenne"

**Problem:** Ursprünglicher Endpoint `/github/:sessionId` erforderte bekannte Session-ID

**Lösung:**
- Neuer Endpoint `POST /github` (ohne Session-ID Parameter)
- Implementierung von `handleGitHubWebhookBroadcast()`:
  - Iteriert über `this.activeSessions.values()`
  - Sendet Reference Card an jede aktive Session
  - Fehlerbehandlung per Session (einzelne Fehler blockieren nicht andere Sessions)

---

### Problem 6: SDK Warnungen
**Warnung (wiederholt):**
```
Unrecognized message type: capabilities_update
```
**Status:** Nicht kritisch, blockiert Grundfunktionalität nicht  
**Vermutung:** SDK-interne Warnung; möglicherweise API-Versions-Mismatch oder neue Capabilities  
**Action:** Zu beobachten; ggf. SDK-Dokumentation prüfen oder Update

---

## 3. Bisherige Lösung

### Technische Architektur

```
┌─────────────────────────────────────────┐
│         GitHub Webhook Event            │
└──────────────┬──────────────────────────┘
               │ POST /github
               │ (X-Hub-Signature-256)
               ▼
┌─────────────────────────────────────────┐
│    GitHubMentraOSApp (TpaServer)        │
│  ┌────────────────────────────────────┐ │
│  │ handleGitHubWebhookBroadcast()     │ │
│  │  - Verify HMAC Signature           │ │
│  │  - Format GitHub Event             │ │
│  │  - Iterate activeSessions          │ │
│  └─────────────┬──────────────────────┘ │
└────────────────┼────────────────────────┘
                 │
    ┌────────────┴───────────┐
    ▼                        ▼
┌─────────┐            ┌─────────┐
│ Session │            │ Session │
│   #1    │   ...      │   #N    │
└────┬────┘            └────┬────┘
     │                      │
     ▼                      ▼
┌──────────┐          ┌──────────┐
│ G1 Glass │          │ G1 Glass │
│  Device  │          │  Device  │
└──────────┘          └──────────┘
```

### Dateistruktur (final)

```
/workspaces/mentraOSPush/
├── app.js                    # Haupt-TPA-Server (single file)
├── package.json              # Dependencies & Scripts
├── .env                      # Umgebungsvariablen (gitignored)
├── .gitignore               # Ignoriert .env, node_modules, logs
├── README.md                # Projekt-Dokumentation
└── erkenntnisse1.md         # Diese Datei
```

**Entfernt:**
- `src/` (alte Azure Function/Express Struktur)
- `host.json` (Azure Functions Host Config)
- `local.settings.json` (Azure Functions Settings)
- `api/function.json` (Function Binding)

### Konfiguration (.env)

```bash
MENTRAOS_API_KEY=<api-key>
PACKAGE_NAME=de.merlinbecker.webhookproxy
PORT=3000
GITHUB_WEBHOOK_SECRET=merlinBeschde
```

### Dependencies (package.json)

**Runtime:**
- `@mentra/sdk` — MentraOS TPA Server & Session Management
- `express` — HTTP Server (embedded via SDK)
- `dotenv` — Environment Variable Loader

**Development:**
- `nodemon` — Auto-Restart bei Code-Änderungen

### Scripts

```bash
npm start          # Startet Server (node app.js)
npm run dev        # Development mit Auto-Reload (nodemon)
```

### API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| `POST` | `/github` | **Broadcast** GitHub Event zu allen Sessions |
| `POST` | `/github/:sessionId` | Legacy: GitHub Event zu spezifischer Session |
| `GET` | `/status` | Server-Status & aktive Sessions (JSON) |
| `POST` | `/test/:sessionId` | Test Reference Card senden |
| `GET` | `/dashboard` | HTML Dashboard UI |
| `POST` | `/webhook` | MentraOS SDK Webhook (automatisch) |

### Kernfunktionen (app.js)

#### 1. Session Management
```javascript
onSession(session, sessionId, userId) {
  this.activeSessions.set(sessionId, session);
  this.sendWelcomeMessage(session, sessionId, userId);
  session.onDisconnected(() => {
    this.activeSessions.delete(sessionId);
  });
}
```

#### 2. GitHub Webhook Broadcast
```javascript
async handleGitHubWebhookBroadcast(event, payload, signature) {
  // 1. Verify HMAC Signature
  if (!this.verifyGitHubSignature(payload, signature)) {
    throw new Error('Invalid signature');
  }
  
  // 2. Format Event → Card
  const card = this.formatGitHubEvent(event, JSON.parse(payload));
  
  // 3. Broadcast to all sessions
  for (const [sessionId, session] of this.activeSessions) {
    try {
      await session.layouts.showReferenceCard(
        card.title,
        card.text,
        { durationMs: 15000 }
      );
    } catch (error) {
      console.error(`Failed for session ${sessionId}:`, error);
    }
  }
}
```

#### 3. HMAC Signature Verification
```javascript
verifyGitHubSignature(payload, signature) {
  if (!this.webhookSecret) return true; // Skip if no secret
  
  const hmac = crypto.createHmac('sha256', this.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
```

### Server Start & Logs (erfolgreich)

```
[dotenv] injecting environment variables from .env
🔧 Initializing GitHub MentraOS App
📱 Package: de.merlinbecker.webhookproxy
🌐 Port: 3000
🔑 API Key: ✅
🔒 Webhook Secret: ✅
🚀 GitHub MentraOS App running!
🎯 TPA server running at http://localhost:3000
📂 Serving static files from ./public
```

---

## 4. Offene Punkte & Nächste Schritte

### ✅ Abgeschlossen
- [x] Azure Functions entfernt, standalone Express/TPA Server
- [x] `.env` Konfiguration implementiert
- [x] Broadcast-Endpoint `/github` implementiert
- [x] SDK API Korrekturen (`TpaServer`, `showReferenceCard`)
- [x] Server startet erfolgreich und läuft stabil
- [x] Signature Verification implementiert

### ⚠️ Teilweise / Zu testen
- [ ] **End-to-End Test mit echtem G1 Device:**
  - Status zeigt derzeit `activeSessions: 0`
  - Broadcast-Funktion ist implementiert, aber nicht live getestet
  - **Next Step:** G1 Device via MentraOS Console verbinden
  
- [ ] **SDK Warnungen:**
  - `Unrecognized message type: capabilities_update`
  - Nicht kritisch, aber zu beobachten
  - Ggf. SDK-Version prüfen oder Maintainer kontaktieren

### 🔄 Optional / Enhancement
- [ ] **Persistent Session Storage:**
  - Derzeit In-Memory Map (Sessions gehen bei Server-Restart verloren)
  - Optional: Redis, SQLite oder File-based Storage
  
- [ ] **Dashboard UI Verbesserungen:**
  - Derzeit minimales inline HTML
  - Optional: React/Vue Frontend, Live-Updates via WebSockets
  
- [ ] **Erweiterte GitHub Event Formatierung:**
  - Mehr Event-Typen (releases, deployments, etc.)
  - Customizable Templates pro Event-Typ
  
- [ ] **Rate Limiting & Security:**
  - Rate Limiting für Webhook-Endpoints
  - Request Logging/Monitoring
  - Optionale IP Whitelist für GitHub Webhooks

---

## 5. Testing & Verifikation

### Lokaler Server Status
```bash
curl http://localhost:3000/status
```

**Response:**
```json
{
  "status": "running",
  "package": "de.merlinbecker.webhookproxy",
  "port": 3000,
  "activeSessions": 0,
  "sessions": []
}
```

### Test Webhook (mit korrekter Signatur)
```bash
# Payload erstellen
PAYLOAD='{"action":"opened","number":123,"pull_request":{"title":"Test PR"}}'

# Signatur berechnen
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "merlinBeschde" | sed 's/SHA2-256(stdin)= /sha256=/')

# Request senden
curl -X POST http://localhost:3000/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$PAYLOAD"
```

### G1 Device Verbindung (nächster Schritt)
1. **MentraOS Console** öffnen (Developer Portal)
2. **App registrieren:** Package `de.merlinbecker.webhookproxy`
3. **Webhook URL:** `http://<public-url>/webhook` (oder ngrok für lokales Testing)
4. **G1 Device** mit App verbinden
5. **Verify:** `GET /status` sollte `activeSessions > 0` zeigen

---

## 6. Lessons Learned

### ✅ Was funktioniert gut
- **Single-File-Architektur:** Für diesen Use Case übersichtlich und wartbar
- **MentraOS SDK:** TpaServer abstrahiert Session-Management gut
- **dotenv:** Einfache Umgebungsvariablen-Verwaltung
- **Inline GitHub Formatter:** Schnell anpassbar, keine externe Dependency

### ⚠️ Herausforderungen
- **SDK Dokumentation:** Einige APIs nicht dokumentiert (`onUserInteraction` existiert nicht)
- **API Signaturen:** `showReferenceCard` Parameter-Reihenfolge war nicht offensichtlich
- **Testing ohne Device:** Schwierig, Broadcast-Logik ohne echte Sessions zu testen

### 🎯 Best Practices etabliert
1. **Environment Variables:** Immer via `.env` und dotenv (nie hardcoded)
2. **Signature Verification:** HMAC validieren für alle Webhook-Endpoints
3. **Error Handling:** Try-Catch pro Session bei Broadcast (einzelne Fehler nicht blocking)
4. **Logging:** Strukturiertes Logging mit Emojis für Übersichtlichkeit
5. **Status Endpoint:** Essentiell für Monitoring und Debugging

---

## 7. Technische Details

### MentraOS SDK Struktur (verwendet)
```javascript
const { TpaServer, TpaSession } = require('@mentra/sdk/dist/tpa');

// TpaServer Methods (used):
- getExpressApp()         // Express app für Custom Routes
- start()                 // Startet TPA Server
- onSession(callback)     // Session Lifecycle Hook

// TpaSession Methods (used):
- layouts.showTextWall(text, options)
- layouts.showReferenceCard(title, text, options)
- onDisconnected(callback)
```

### GitHub Webhook Headers (relevant)
```
X-GitHub-Event: <event-type>           # z.B. "push", "pull_request"
X-Hub-Signature-256: sha256=<hmac>     # HMAC SHA-256 Signatur
Content-Type: application/json         # Payload Format
```

### Reference Card Options
```javascript
{
  durationMs: 15000,    // Anzeigedauer in Millisekunden
  // Weitere Optionen je nach SDK Version
}
```

---

## Fazit

Die Migration von Azure Functions zu einem standalone MentraOS TPA Server war erfolgreich. Die Hauptfunktionalität (GitHub Webhooks → Broadcast zu G1 Brillen) ist implementiert und lokal getestet (ohne aktive Sessions). Der nächste kritische Schritt ist die Verbindung eines echten G1 Devices zum Live-Test der Broadcast-Funktion.

Die wichtigsten Learnings waren SDK-API-Signaturen (korrektes `showReferenceCard` Format) und die Notwendigkeit von `dotenv` für `.env`-Unterstützung. Die Architektur ist jetzt deutlich einfacher (single-file) und leichter zu warten als die ursprüngliche Azure Functions Struktur.

**Status:** ✅ Server läuft stabil | ⏳ Wartet auf G1 Device Connection für End-to-End Test
