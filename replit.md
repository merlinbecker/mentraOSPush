# GitHub MentraOS Webhook Relay

## Projektübersicht
Express-Anwendung, die GitHub Webhooks empfängt und diese als Reference Cards an MentraOS G1 Brillen weiterleitet. Die App nutzt das MentraOS SDK, um persistente WebSocket-Verbindungen zu den Brillen aufrechtzuerhalten und GitHub-Events in Echtzeit weiterzuleiten.

## Aktuelle Konfiguration

### Server-Setup
- **Port**: 5000 (Replit-Standard, extern über Port 80 erreichbar)
- **Package Name**: `de.merlinbecker.webhookproxy`
- **Deployment-Typ**: Reserved VM (für persistente WebSocket-Verbindungen)
- **Node.js Version**: >=18.0.0
- **Host Binding**: 0.0.0.0 (via MentraOS SDK, für Cloud-Zugriff erforderlich)

### Umgebungsvariablen
Die folgenden Secrets sind konfiguriert:
- `MENTRAOS_API_KEY`: MentraOS API-Schlüssel (erforderlich)
- `GITHUB_WEBHOOK_SECRET`: GitHub Webhook-Sicherheitsschlüssel (optional, aber empfohlen)
- `PORT`: Wird automatisch auf 5000 gesetzt

### Replit Deployment URL
Die öffentliche URL für Webhooks (nach Deployment):
```
https://61b781e2-0527-4a7b-8ad6-bbdbff1e74aa-00-n0ppkdngl338.picard.replit.dev/webhook
```

## Architektur

### Backend (Node.js/Express)
- **Framework**: Express.js mit MentraOS SDK
- **Hauptdatei**: `app.js`
- **Session-Management**: In-Memory Map für aktive Brillen-Sessions
- **Webhook-Verarbeitung**: GitHub Event Parser und Formatter

### Wichtige Endpoints
- `/webhook` - MentraOS SDK Webhook (für Brillen-Verbindungen)
- `/github` - GitHub Webhook Broadcast (an alle verbundenen Brillen)
- `/github/{sessionId}` - GitHub Webhook für spezifische Session
- `/dashboard` - Web-UI für Session-Übersicht
- `/status` - JSON-API für aktive Sessions
- `/test/{sessionId}` - Test-Endpoint für Messages
- `/health` - Health Check

## Verwendung

### 1. MentraOS Console Setup
1. Gehe zu [MentraOS Console](https://console.mentra.glass)
2. Erstelle neue App mit Package Name: `de.merlinbecker.webhookproxy`
3. Webhook URL: `https://<deine-replit-url>/webhook`

### 2. Brille verbinden
1. App auf G1 Brille installieren
2. Automatische Verbindung über MentraOS SDK
3. Session-ID erscheint im Dashboard

### 3. GitHub Webhook einrichten
1. GitHub Repository → Settings → Webhooks
2. Payload URL: `https://<deine-replit-url>/github`
3. Content-Type: `application/json`
4. Secret: Dein `GITHUB_WEBHOOK_SECRET`
5. Events auswählen: `push`, `pull_request`, `issues` (oder alle)

## Bekannte Besonderheiten

### SDK Error Workaround
Die App enthält einen Workaround für harmlose SDK-Fehler bei `capabilities_update` Messages. Diese Fehler werden automatisch unterdrückt und beeinflussen die Funktionalität nicht.

### Reserved VM Deployment
Die App verwendet Reserved VM-Deployment (nicht Autoscale), weil:
- Persistente WebSocket-Verbindungen zu den Brillen erforderlich sind
- Session-Daten im Speicher gehalten werden
- Kontinuierlicher Betrieb ohne Restart notwendig ist

### Deployment-Konfiguration
- **Run-Befehl**: `PORT=5000 npm start` (stellt sicher, dass Port 5000 verwendet wird)
- **Port-Forwarding**: Interner Port 5000 → Externer Port 80
- **Environment**: PORT wird explizit auf 5000 gesetzt
- **Host**: Bindet an 0.0.0.0 (über MentraOS SDK) für externe Erreichbarkeit

## Entwicklung

### Lokale Entwicklung
```bash
npm run dev  # Nodemon mit Auto-Reload
```

### Produktion
```bash
npm start    # Production Mode
```

### Dependencies
- `@mentra/sdk`: MentraOS SDK für G1 Brillen
- `express`: Web-Framework
- `dotenv`: Environment Variable Management
- `nodemon`: Development Auto-Reload (devDependency)

## Letzte Änderungen
- **2025-10-18**: Initiales Setup für Replit-Umgebung
  - Port auf 5000 konfiguriert
  - VM Deployment eingerichtet
  - Environment Secrets konfiguriert
  - Workflow für Development-Server erstellt

## Nächste Schritte
1. App in MentraOS Console registrieren
2. Brille verbinden und Session-ID notieren
3. GitHub Webhook konfigurieren
4. Testen mit `/test/{sessionId}` Endpoint
5. Deployment veröffentlichen für öffentliche URL
