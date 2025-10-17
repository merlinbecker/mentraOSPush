# SDK Error Workaround - Implementation Guide

## Problem
MentraOS SDK (aktuellste Version, geprüft am 17.10.2025) wirft Fehler:
```
Error: Unrecognized message type: capabilities_update
```

## Lösung: Workaround implementiert ✅

### Implementierte Funktionen

#### 1. `setupSDKErrorWorkaround()` - Console Error Interceptor
**Datei:** `app.js` (Zeile ~103-130)

Diese Funktion fängt alle `console.error()` Aufrufe ab und filtert bekannte SDK-Fehler:

```javascript
/**
 * WORKAROUND: Setup error handler to suppress known SDK issues
 * 
 * Issue: MentraOS SDK throws "Unrecognized message type: capabilities_update"
 * Cause: Platform sends new message types that SDK doesn't support yet
 * Impact: Harmless - doesn't affect functionality
 * Status: SDK is up-to-date (checked 2025-10-17), but still occurs
 * 
 * TODO: Remove this workaround when SDK supports capabilities_update
 */
setupSDKErrorWorkaround() {
  const originalConsoleError = console.error.bind(console);
  
  console.error = (...args) => {
    const message = args.join(' ');
    
    // Suppress known harmless SDK errors
    if (message.includes('Unrecognized message type: capabilities_update')) {
      console.log('🔇 [SDK Workaround] Suppressed: capabilities_update message (harmless)');
      return;
    }
    
    // Pass through all other errors
    originalConsoleError(...args);
  };
  
  console.log('⚠️  SDK Error Workaround active: Suppressing "capabilities_update" errors');
}
```

**Was es tut:**
- Überschreibt `console.error` mit einer Wrapper-Funktion
- Prüft ob die Nachricht "capabilities_update" enthält
- Unterdrückt diese spezifischen Fehler
- Lässt alle anderen Fehler durch

**Wo aufgerufen:**
```javascript
constructor() {
  super({ /* ... */ });
  this.activeSessions = new Map();
  
  // WORKAROUND: Suppress SDK errors for unknown message types
  this.setupSDKErrorWorkaround();
}
```

---

#### 2. Process-Level Error Handlers
**Datei:** `app.js` (Zeile ~670-705)

Diese Handler fangen Fehler auf, die durch die Maschen rutschen:

```javascript
// WORKAROUND: Handle uncaught SDK errors
// These handlers catch errors that escape the SDK's internal error handling

process.on('uncaughtException', (err) => {
  // WORKAROUND: Suppress known SDK error - capabilities_update
  if (err.message && err.message.includes('Unrecognized message type')) {
    console.log(`🔇 [SDK Workaround] Suppressed uncaught exception: ${err.message}`);
    return;
  }
  
  console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  // WORKAROUND: Suppress known SDK error - capabilities_update
  if (reason && reason.message && reason.message.includes('Unrecognized message type')) {
    console.log(`🔇 [SDK Workaround] Suppressed unhandled rejection: ${reason.message}`);
    return;
  }
  
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});
```

**Was sie tun:**
- Fangen `uncaughtException` Events ab
- Fangen `unhandledRejection` Events ab
- Prüfen ob es sich um den bekannten SDK-Fehler handelt
- Unterdrücken diese spezifischen Fehler
- Loggen alle anderen Fehler normal

---

## Verwendung

### Automatisch aktiv
Der Workaround ist automatisch aktiv, sobald die App startet. Du siehst:
```
⚠️  SDK Error Workaround active: Suppressing "capabilities_update" errors
```

### Log-Output
Statt vielen Error-Zeilen:
```
[ERROR] ❌ [Session ...] Error: Unrecognized message type: capabilities_update
[ERROR] ❌ [Session ...] Error: Unrecognized message type: capabilities_update
[ERROR] ❌ [Session ...] Error: Unrecognized message type: capabilities_update
```

Siehst du jetzt nur:
```
🔇 [SDK Workaround] Suppressed: capabilities_update message (harmless)
```

---

## Entfernung des Workarounds

### Wann entfernen?
✅ Wenn eine neue SDK-Version `capabilities_update` unterstützt
✅ Wenn der Fehler nicht mehr auftritt

### Wie entfernen?

**1. Suche nach allen Workaround-Stellen:**
```bash
grep -n "WORKAROUND" app.js
```

**2. Entferne folgende Code-Bereiche:**

**In Constructor (Zeile ~100):**
```javascript
// ENTFERNEN:
this.setupSDKErrorWorkaround();
```

**Gesamte Methode (Zeile ~103-130):**
```javascript
// ENTFERNEN:
setupSDKErrorWorkaround() { ... }
```

**Process Error Handlers (Zeile ~670-705):**
```javascript
// ENTFERNEN:
process.on('uncaughtException', (err) => { ... });
process.on('unhandledRejection', (reason, promise) => { ... });
```

**3. Teste, ob Fehler noch auftritt:**
```bash
npm run start
# Verbinde Brille und prüfe Logs
```

**4. Wenn keine Fehler mehr:**
```bash
# Lösche Dokumentation
rm SDK-ERRORS.md WORKAROUND-SDK-ERRORS.md
```

---

## Testing

### Testen ob Workaround funktioniert

**1. Starte Server:**
```bash
npm run start
```

**2. Prüfe auf Aktivierungsmeldung:**
```
⚠️  SDK Error Workaround active: Suppressing "capabilities_update" errors
```

**3. Verbinde Brille:**
- Öffne App auf der Brille
- Beobachte Logs

**4. Erwartetes Verhalten:**
- ✅ Keine Error-Logs mit "capabilities_update"
- ✅ Stattdessen: `🔇 [SDK Workaround] Suppressed: ...`
- ✅ App funktioniert normal
- ✅ Webhooks werden empfangen
- ✅ Reference Cards werden angezeigt

---

## Technische Details

### Warum passiert das?

Die MentraOS-Plattform sendet neue Geräte-Capabilities an verbundene Apps:

```json
{
  "type": "capabilities_update",
  "capabilities": {
    "modelName": "Even Realities G1",
    "hasCamera": false,
    "hasDisplay": true,
    "display": {
      "resolution": { "width": 640, "height": 200 },
      "color": "green",
      "maxTextLines": 5
    },
    // ...
  }
}
```

Das SDK kennt diesen Message-Typ nicht und wirft einen Fehler. Da die Capabilities-Informationen aktuell nicht genutzt werden, ist der Fehler harmlos.

### Warum nicht im SDK fixen?

- SDK ist Open-Source, aber wir haben keinen direkten Zugriff
- Workaround ist schneller als auf SDK-Update zu warten
- Workaround ist sauber isoliert und einfach zu entfernen

---

## Status

- **Problem:** SDK erkennt `capabilities_update` nicht
- **SDK Version:** Aktuell (geprüft am 17.10.2025)
- **Workaround:** ✅ Implementiert und aktiv
- **Funktionalität:** ✅ Nicht beeinträchtigt
- **Log-Pollution:** ✅ Behoben
- **Empfehlung:** Workaround nutzen bis SDK-Update

---

## Support

Bei Fragen oder Problemen:
1. Prüfe `SDK-ERRORS.md` für Details zum Fehler
2. Prüfe ob Workaround aktiv ist (Log-Meldung beim Start)
3. Teste ob App trotz Fehler funktioniert
4. Bei echten Problemen: Issue im Repository öffnen
