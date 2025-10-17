# GitHub MentraOS Webhook Relay

**Minimale Express App mit MentraOS SDK Integration**

Eine einfache Express-Anwendung, die GitHub Webhooks empfängt und diese als Reference Cards an MentraOS G1 Brillen weiterleitet.

## 🚀 Setup

### 1. Dependencies installieren
```bash
npm install
```

### 2. Environment konfigurieren
```bash
cp .env.template .env
# .env Datei bearbeiten und API Keys eintragen
```

### 3. Server starten
```bash
# Produktionsstart
npm start

# Development mit Auto-Reload
npm run dev
```

## 🔧 Konfiguration

### Environment Variablen (`.env`)
```bash
MENTRAOS_API_KEY=your_mentraos_api_key_here
PACKAGE_NAME=com.mentraos.github-webhook-relay
PORT=3000
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_here
```

## 📱 MentraOS App Setup

### 1. MentraOS Console
- Gehe zu [MentraOS Console](https://console.mentra.glass)
- Erstelle neue App mit Package Name: `com.mentraos.github-webhook-relay`
- Webhook URL eintragen: `http://localhost:3000/webhook`

### 2. Brille verbinden
- App auf G1 Brille installieren
- Automatische Verbindung über MentraOS SDK

## 🔗 GitHub Webhook Setup

### Für jede GitHub Session:
1. Session ID aus MentraOS App Status abrufen: `GET /status`
2. GitHub Repository Settings → Webhooks
3. Webhook URL: `http://localhost:3000/github/{sessionId}`
4. Content Type: `application/json`
5. Secret: Dein `GITHUB_WEBHOOK_SECRET`
6. Events: `push`, `pull_request`, `issues` (oder alle)

## 📍 API Endpoints

- **`/webhook`** - MentraOS SDK Webhook (automatisch)
- **`/github/{sessionId}`** - GitHub Webhooks empfangen
- **`/status`** - Server Status und aktive Sessions
- **`/test/{sessionId}`** - Test Message an Session senden
- **`/health`** - Health Check

## 🔍 Debugging

### Server Status prüfen
```bash
curl http://localhost:3000/status
```

### Test Message senden
```bash
curl -X POST http://localhost:3000/test/{sessionId}
```

### Logs anschauen
Die App loggt alle Events mit Pino Logger in der Konsole.

## 🌐 URLs für MentraOS App

**Lokale Development:**
- Webhook URL: `http://localhost:3000/webhook`
- Port: `3000`

**Production Deployment:**
- Webhook URL: `https://yourdomain.com/webhook`  
- Port: `80/443` (je nach Setup)

## 🔄 Flow

1. **Brille verbindet sich** → MentraOS SDK ruft `/webhook` auf
2. **`onSession()` Handler** → Welcome Message, Session speichern
3. **GitHub Webhook** → `POST /github/{sessionId}`
4. **Reference Card** → Direkt über MentraOS SDK an Brille

## ⚠️ Known Issues

### SDK Error: "Unrecognized message type: capabilities_update"
**Status:** Bekanntes Problem, Workaround implementiert ✅

Das MentraOS SDK (neueste Version) wirft harmlose Fehler für neue Message-Typen. Diese werden automatisch unterdrückt.

**Details:** Siehe `SDK-ERRORS.md` und `WORKAROUND-SDK-ERRORS.md`

**Log-Output:**
```
⚠️  SDK Error Workaround active: Suppressing "capabilities_update" errors
🔇 [SDK Workaround] Suppressed: capabilities_update message (harmless)
```

**Impact:** Keine - App funktioniert normal trotz Fehler

**TODO:** Workaround entfernen, wenn SDK das Problem behebt