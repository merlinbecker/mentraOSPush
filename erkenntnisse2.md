# Erkenntnisse - GitHub Webhook Relay (erkenntnisse2)

Datum: 2025-10-17

Kurzfassung
-----------
Diese Datei fasst die während der Entwicklung und Problemlösung aufgetretenen Fehler, deren Ursachen und die implementierten Workarounds zusammen. Ziel war, GitHub-Webhooks zuverlässig zu empfangen, korrekt zu verifizieren und an MentraOS-Sessions weiterzuleiten.

1) GitHub Signature Verification (HMAC)
--------------------------------------
Symptom:
- Webhooks wurden als "Invalid GitHub webhook signature" abgelehnt.

Ursache:
- GitHub berechnet die HMAC-Signatur über den originalen raw JSON-String.
- Der Server hatte unterschiedliche Body-Formate (Buffer, String, bereits geparstes Object).
- Bei Verifizierung wurde manchmal ein Object oder veränderter String verwendet, wodurch HMAC nicht mehr übereinstimmte.

Maßnahmen:
- `verifyGitHubSignature(payload, signature)` robust gemacht:
  - Akzeptiert Buffer, String und Object (Object wird nur als Fallback via JSON.stringify zurückgewandelt).
  - Nutzt Buffer für HMAC-Berechnung.
  - Fügt ausführliches Logging hinzu (Payload-Typ, Länge, erwartete vs. empfangene Signatur).
- Raw-Body zuverlässig erfassen: Express-Parser mit `verify`-Hook verwendet, statt mehrfachen direkten Stream-Lesens.

2) Body-Parsing / Content-Types
-------------------------------
Symptom:
- Fehler "Unexpected token 'p', "payload=%7"..." (URL-encoded payloads)
- Fehler "The first argument must be of type string or an instance of Buffer... Received an instance of Object"
- Fehler "stream is not readable" beim mehrfachen Lesen des Request-Streams

Ursache:
- GitHub kann Webhooks entweder als `application/json` senden oder als `application/x-www-form-urlencoded` (mit Feld `payload=` URL-encoded).
- Ein manueller Stream-Reader zusammen mit Express-Body-Parsern führte zu Konflikten.

Maßnahmen:
- Body-Parser-Konfiguration angepasst:
  - `express.json({ verify: (req, res, buf) => req.rawBody = buf })`
  - `express.urlencoded({ verify: (req, res, buf) => req.rawBody = buf })`
- Content-Type-Erkennung im Endpoint:
  - Bei `application/x-www-form-urlencoded` wird `req.body.payload` verwendet und korrekt decodiert.
  - Bei `application/json` wird `req.rawBody` oder `JSON.stringify(req.body)` als HMAC-Input verwendet.
- Damit vermeiden wir Mehrfachlesen des Streams und erhalten konstant den originalen Payload für HMAC.

3) URL-encoded Webhooks
------------------------
- GitHub kann POSTs mit `payload=%7B...%7D` senden (alte Integrationen). Es wurde explizit Unterstützung für dieses Format hinzugefügt, d.h. `req.body.payload` wird extrahiert und verwendet.

4) MentraOS SDK Probleme
------------------------
Gefundene, SDK-bezogene Fehler:
- "Unrecognized message type: capabilities_update"
  - Ursache: MentraOS-Plattform sendet neuen Message-Typ, SDK kennt ihn (noch) nicht.
  - Impact: Harmlos für die App-Funktionalität, aber Log-Pollution.
  - Maßnahme: Workaround implementiert (gezieltes Unterdrücken dieser Logs / Exceptions). Markiert als WORKAROUND im Code und dokumentiert. TODO: Entfernen, wenn SDK-Update verfügbar.

- "session.disconnect is not a function" beim Shutdown
  - Ursache: SDK ruft `session.disconnect()` beim Cleanup, die Methode existiert nicht.
  - Impact: Tritt nur beim Shutdown auf, beeinflusst Laufzeit nicht.
  - Maßnahme: Try/Catch im SIGINT-Handler und Suppression in `uncaughtException`-Handler, ebenfalls als WORKAROUND markiert.

5) Logging & Beobachtbarkeit
----------------------------
- Verbessertes Logging in `verifyGitHubSignature` und in den Endpoints:
  - Payload type, isBuffer, payload length
  - Content-Type und ob Signature-Header vorhanden ist
  - Expected vs. Received signature (gekürzt)
  - Erfolg / Fehler bei Verifikation
- Diese Logs helfen beim Debuggen von falsch formatierten Requests oder beim Vergleich der Signaturen.

6) Wo im Code geändert (Kurzübersicht)
---------------------------------------
- `app.js`:
  - `verifyGitHubSignature` -> robustere Typbehandlung & Logging
  - Express Middleware -> `verify`-Hook für json & urlencoded
  - `/github` und `/github/:sessionId` Endpoints -> Content-Type Handling & URL-encoded Support
  - SDK-Workarounds: `setupSDKErrorWorkaround()` und process-level handlers
  - SIGINT-Handler: Try/Catch für `app.stop()`
- `SDK-ERRORS.md`, `WORKAROUND-SDK-ERRORS.md` -> Dokumentation

7) Empfehlungen / Next Steps
---------------------------
- Weiter beobachten und Logs prüfen (besonders Signatur-Fehler) nach einem Deploy.
- SDK-Repository beobachten / Upgrades prüfen: Entferne Workarounds sobald SDK `capabilities_update` unterstützt oder SDK-Bugfix für `session.disconnect` veröffentlicht wird.
- Optional: Unit-Tests für `verifyGitHubSignature` hinzufügen (happy path + malformed payload + URL-encoded case).

---

Wenn du möchtest, übernehme ich noch:
- Unit-Test(s) für die HMAC-Verifikation
- Entfernen der Workarounds sobald SDK-Update verfügbar
- Kleinen Health-Check, der Webhook-Receiver mit Test-Payloads verifiziert

