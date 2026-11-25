# EJZ Poppetje — offline iPhone-webapp

Datum: 25-11-2026  
Gemaakt door: Grok Bot  
Status: live op GitHub Pages, 25-11-2026, na ja van Ernst.

Live: https://ernstz77.github.io/poppetje/

Repo: https://github.com/ErnstZ77/poppetje

Interactief poppetje voor op het iPhone-beginscherm, getekend naar het Bitmap-voorbeeld: zwart rond hoofd, witte verticale pill-ogen die opzij kijken, geen mond, en een strakke groene headset (dunne beugel met een kleine opening boven het hoofd, oorschelpen aan de zijkant, dun microfoonhengsel) in één vlakke kleur (#3F8C66). Lichte grijsblauwe achtergrond, groene tekstballonnen met wit en een mini-avatar. Bij lang indrukken valt de hele headset als één stuk omlaag en klikt hij vast. Geïnspireerd op de beweging uit de Bitmap Studio-post, maar een eigen EJZ-karakter (geen kopie van het Grok Bot-logo). Gebouwd met lokaal anime.js (MIT), zonder CDN.

## Klaar / check

- Klaar = een offline interactieve PWA met mascotte voor het beginscherm.
- Check = screenshot 390×844 plus drie reactieframes, zonder consolefouten.

## Wat het doet

- Ogen volgen je vinger.
- Tik: stuiter en knipper.
- Veeg: het hoofd draait mee.
- Kantelen (DeviceOrientation). Op iOS eerst op **Kantelen aanzetten** tikken (toestemming).
- Lang indrukken: koptelefoon aan of uit (valt omlaag en klikt vast).
- Zoekveld: typen laat het poppetje meedenken; Enter opent de zoekopdracht in Google (in Safari).
- Na 5 seconden stilte een willekeurige idle-animatie.
- Tekstballonnetjes met korte Nederlandse zinnen, die omhoog schuiven.
- Houdt rekening met `prefers-reduced-motion`.
- Werkt offline via een service worker, met `manifest.json` en apple-touch-icon.

## Lokaal bekijken

```bash
cd /workspace/team/poppetje-webapp
python3 -m http.server 8765
```

Open daarna `http://127.0.0.1:8765/` op je computer, of op je iPhone in hetzelfde netwerk. Een `file://`-pagina is niet genoeg voor de service worker.

## Op het beginscherm zetten

1. Open in Safari (niet in Chrome): https://ernstz77.github.io/poppetje/
2. Deel → **Zet op beginscherm**.
3. Bevestig de naam **Poppetje**.

## Bestanden

- `index.html`, `manifest.json`, `sw.js`, `.nojekyll`
- `assets/` — stijl, logica, iconen, lokaal `anime.min.js` + MIT-licentie

## Bronnen

- anime.js v3.2.2, MIT, gekopieerd uit `team/ejz/b-versie/assets/anime.min.js`
- Bewegingsidee: X-post van Bitmap Studio / @magdiel_rb, 25-11-2026
- Headsetgroen naar het Bitmap-voorbeeld (`#3F8C66`)
