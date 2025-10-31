# GitHub MentraOS Webhook Relay

**Minimale Express App mit MentraOS SDK Integration**

Eine einfache Express-Anwendung, die GitHub Webhooks empfängt und diese als Reference Cards an MentraOS G1 Brillen weiterleitet.

## 📖 Dokumentation

**Vollständige Architekturdokumentation:** [documentation/arc42.md](documentation/arc42.md)

Die arc42 Dokumentation enthält:
- Systemübersicht und Qualitätsziele
- Detaillierte Bausteinsicht mit C4 Diagrammen
- Laufzeitsicht und Deployment
- Architekturentscheidungen (ADRs)
- Bekannte Probleme und technische Schulden

## 🚀 Quick Start

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

**Empfohlener Broadcast-Modus:**
1. GitHub Repository Settings → Webhooks
2. Webhook URL: `http://localhost:3000/github` (ohne Session-ID)
3. Content Type: `application/json`
4. Secret: Dein `GITHUB_WEBHOOK_SECRET`
5. Events: `push`, `pull_request`, `issues` (oder alle)

> **Hinweis:** Der Broadcast-Endpoint sendet Events an alle verbundenen Brillen.

## 📍 API Endpoints

- **`/webhook`** - MentraOS SDK Webhook (automatisch)
- **`/github`** - GitHub Webhooks broadcast zu allen Sessions
- **`/github/{sessionId}`** - GitHub Webhooks an spezifische Session
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

## ⚠️ Bekannte Probleme

Siehe [documentation/arc42.md - Risiken und technische Schulden](documentation/arc42.md#risiken-und-technische-schulden) für Details zu:
- SDK Error Workarounds
- In-Memory Session Storage Limitierungen
- Weitere technische Schulden

## 🔄 Vereinfachter Flow

1. **Brille verbindet sich** → MentraOS SDK ruft `/webhook` auf
2. **`onSession()` Handler** → Welcome Message, Session speichern
3. **GitHub Webhook** → `POST /github` (Broadcast)
4. **Reference Cards** → Direkt über MentraOS SDK an alle Brillen