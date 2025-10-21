# MentraOS SDK - Bekannte Fehler

> **Hinweis:** Diese Dokumentation wurde in die arc42 Architekturdokumentation übernommen.  
> Siehe [documentation/arc42.md - Risiken und technische Schulden](documentation/arc42.md#risiken-und-technische-schulden) für die vollständige Dokumentation.

## ⚠️ "Unrecognized message type: capabilities_update"

### Beschreibung
```
Error: Unrecognized message type: capabilities_update
    at TpaSession.handleMessage
```

### Ursache
Das MentraOS SDK empfängt einen neuen Message-Typ (`capabilities_update`), den die aktuelle SDK-Version noch nicht unterstützt. Dies ist eine Versionsinkompatibilität zwischen dem SDK und der MentraOS-Plattform.

### Impact
⚠️ **HARMLOS** - Dieser Fehler kann ignoriert werden!
- Der Fehler beeinträchtigt NICHT die Funktionalität der App
- Webhooks werden weiterhin korrekt empfangen und weitergeleitet
- Sessions bleiben verbunden
- Reference Cards werden korrekt angezeigt

### Status
- **SDK Version:** Aktuell (geprüft am 17.10.2025 mit `npm update @mentra/sdk`)
- **Fehler tritt weiterhin auf:** Ja
- **Workaround implementiert:** ✅ Ja

### Workaround (Implementiert)

Der Code enthält jetzt einen **Workaround**, der diese spezifischen SDK-Fehler automatisch unterdrückt:

#### 1. Console Error Interceptor
```javascript
setupSDKErrorWorkaround() {
  const originalConsoleError = console.error.bind(console);
  
  console.error = (...args) => {
    const message = args.join(' ');
    
    // Suppress known harmless SDK errors
    if (message.includes('Unrecognized message type: capabilities_update')) {
      console.log('🔇 [SDK Workaround] Suppressed: capabilities_update message');
      return;
    }
    
    originalConsoleError(...args);
  };
}
```

#### 2. Process-Level Error Handlers
```javascript
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('Unrecognized message type')) {
    console.log(`🔇 [SDK Workaround] Suppressed uncaught exception`);
    return;
  }
  console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('Unrecognized message type')) {
    console.log(`🔇 [SDK Workaround] Suppressed unhandled rejection`);
    return;
  }
  console.error('💥 Unhandled Rejection:', reason);
});
```

### Log-Output mit Workaround
Statt vielen Error-Zeilen siehst du jetzt nur:
```
🔇 [SDK Workaround] Suppressed: capabilities_update message (harmless)
```

### Lösung (ohne Workaround)
Es gibt mehrere Möglichkeiten:

#### 1. **Workaround nutzen (empfohlen)** ✅
Der implementierte Workaround unterdrückt die Fehler automatisch. Keine weitere Aktion nötig.

#### 2. **SDK Update abwarten**
```bash
npm update @mentra/sdk
```
Prüfe regelmäßig, ob eine neuere SDK-Version `capabilities_update` unterstützt.

#### 3. **SDK Downgrade** (nicht empfohlen)
```bash
npm install @mentra/sdk@<ältere-version>
```
Nutze eine ältere SDK-Version, die diesen Message-Typ nicht erwartet.

### Entfernung des Workarounds

**TODO:** Entferne den Workaround, wenn:
1. Eine neue SDK-Version `capabilities_update` unterstützt
2. Der Fehler nicht mehr auftritt

**Code-Stellen zum Entfernen:**
- `setupSDKErrorWorkaround()` Methode (ca. Zeile 100-120)
- Process Error Handler für `uncaughtException` (ca. Zeile 680-690)
- Process Error Handler für `unhandledRejection` (ca. Zeile 690-700)

Suche nach: `WORKAROUND` im Code

### Technischer Hintergrund
Die MentraOS-Plattform sendet neue Features/Capabilities an verbundene Apps. Das SDK erkennt diesen neuen Message-Typ noch nicht, was zu diesem Error führt. Dies ist ein typisches Problem bei Rolling-Updates, wo die Plattform schneller aktualisiert wird als das SDK.

Die `capabilities_update` Message enthält Geräte-Informationen wie:
- Display-Auflösung (640x200)
- Mikrofon-Unterstützung
- Farbe (grün)
- Maximale Textzeilen (5)
- etc.

Diese Informationen werden vom SDK aktuell nicht genutzt, daher ist der Fehler harmlos.

### Status
- **Problem:** SDK erkennt `capabilities_update` nicht
- **Workaround:** ✅ Implementiert und aktiv
- **Funktionalität:** ✅ Nicht beeinträchtigt
- **Log-Pollution:** ✅ Behoben durch Workaround
- **Empfehlung:** Workaround nutzen bis SDK-Update

---

## ⚠️ "session.disconnect is not a function"

### Beschreibung
```
TypeError: session.disconnect is not a function
    at GitHubMentraOSApp.cleanup (/node_modules/@mentra/sdk/dist/tpa/server/index.js:429:21)
    at GitHubMentraOSApp.stop
```

### Ursache
Das MentraOS SDK versucht beim Shutdown `session.disconnect()` aufzurufen, aber diese Funktion existiert nicht im Session-Objekt. Dies ist ein Bug im SDK selbst.

### Wann tritt es auf?
- Beim Beenden der App mit `Ctrl+C` (SIGINT)
- Beim Aufrufen von `app.stop()`
- Bei automatischem Shutdown

### Impact
⚠️ **HARMLOS** - Dieser Fehler kann ignoriert werden!
- Tritt nur beim Shutdown auf
- App funktioniert während der Laufzeit normal
- Sessions werden trotzdem getrennt
- Keine Daten gehen verloren

### Status
- **SDK Version:** Aktuell (geprüft am 17.10.2025)
- **Fehler tritt weiterhin auf:** Ja
- **Workaround implementiert:** ✅ Ja

### Workaround (Implementiert)

#### 1. Try-Catch im SIGINT Handler
```javascript
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down GitHub MentraOS App...');
  
  // WORKAROUND: SDK throws error on stop()
  try {
    app.stop();
  } catch (err) {
    if (err.message && err.message.includes('session.disconnect is not a function')) {
      console.log('🔇 [SDK Workaround] Suppressed shutdown error (SDK bug)');
    } else {
      console.error('❌ Error during shutdown:', err);
    }
  }
  
  process.exit(0);
});
```

#### 2. UncaughtException Handler
```javascript
process.on('uncaughtException', (err) => {
  // WORKAROUND: Suppress SDK shutdown error
  if (err.message && err.message.includes('session.disconnect is not a function')) {
    console.log('🔇 [SDK Workaround] Suppressed shutdown error (SDK bug)');
    process.exit(0);
    return;
  }
  
  console.error('💥 Uncaught Exception:', err);
});
```

### Log-Output mit Workaround
Statt:
```
^C💥 Uncaught Exception: TypeError: session.disconnect is not a function
```

Siehst du jetzt:
```
^C
🛑 Shutting down GitHub MentraOS App...
🔇 [SDK Workaround] Suppressed shutdown error (SDK bug)
```

### Technischer Hintergrund
Das SDK versucht beim Cleanup alle aktiven Sessions zu trennen. Der Code im SDK sieht ungefähr so aus:

```javascript
// Im SDK (fehlerhaft):
cleanup() {
  for (const session of this.sessions) {
    session.disconnect(); // ❌ Diese Funktion existiert nicht!
  }
}
```

Die korrekte Methode wäre vermutlich `session.close()` oder `session.stop()`.

---

## Weitere SDK-Fehler

*Hier können weitere bekannte SDK-Fehler dokumentiert werden*
