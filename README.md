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
- Zoeken blijft in de app: resultaatkaarten van Wikipedia en DuckDuckGo. Alleen een tik op een kaart gaat naar buiten.
- Praten: tik op de microfoon. Na ongeveer een seconde stilte antwoordt hij vanzelf, wist het zoekveld en luistert hij opnieuw. Tik nog eens op de microfoon om te stoppen. Werkt de knop niet, dan kun je dicteren via het microfoontje op het toetsenbord; na een korte stilte stuurt hij het automatisch in.
- Hij beantwoordt hoi, hoe laat het is, welke dag het is, moppen en rekensommen (zoals 4×4 of twaalf gedeeld door drie) hardop.
- “Zet Spotify aan” of “speel muziek”: hij probeert Spotify te openen. Lukt dat niet vanzelf, tik dan op **Open Spotify**. Met een opdracht in Opdrachten (zie hieronder) kan de muziek écht starten.
- Na 5 seconden stilte een willekeurige idle-animatie.
- Tekstballonnetjes met het gesprek (jouw tekst en zijn antwoord).
- Houdt rekening met `prefers-reduced-motion`.
- Werkt offline via een service worker, met `manifest.json` en apple-touch-icon.

## Opdracht “Speel Spotify” maken

Een webapp mag op iOS muziek niet zelf starten. Een opdracht in **Opdrachten** kan dat wél, als jij op de knop tikt. Zo maak je die opdracht:

1. Open de app **Opdrachten** op je iPhone.
2. Tik rechtsboven op **+**.
3. Tik op **Voeg taak toe**.
4. Het sterkst: zoek **Open URL** en vul in: `spotify:internal:collection:tracks` (dat opent Spotify en speelt je favoriete nummers). Zie je bij Spotify een taak als **Play** of **Afspelen**, dan mag je die ook gebruiken. Alleen **Open app** → Spotify opent de app, maar start de muziek meestal niet.
5. Tik bovenaan op de naam en noem de opdracht precies **Speel Spotify**.
6. Tik op **Gereed**.
7. Open Poppetje, tik onderaan op **Instellingen** en vul bij **Opdracht-naam** exact hetzelfde in: `Speel Spotify`.

Daarna zegt hij bij “zet Spotify aan” dat hij je opdracht start. Tik op **Start opdracht** als het niet vanzelf gaat (iOS vraagt daar vaak een tik voor).

## Op het beginscherm zetten

1. Open in Safari (niet in Chrome): https://ernstz77.github.io/poppetje/
2. Deel → **Zet op beginscherm**.
3. Bevestig de naam **Poppetje**.
4. Een update binnenhalen: sluit de app helemaal (omhoog vegen in het appoverzicht) en open hem een of twee keer opnieuw.

## Lokaal bekijken

```bash
cd /workspace/team/poppetje-webapp
python3 -m http.server 8765
```

Open daarna `http://127.0.0.1:8765/` op je computer, of op je iPhone in hetzelfde netwerk. Een `file://`-pagina is niet genoeg voor de service worker.

## Bestanden

- `index.html`, `manifest.json`, `sw.js`, `.nojekyll`
- `assets/` — stijl, logica, iconen, lokaal `anime.min.js` + MIT-licentie

## Bronnen

- anime.js v3.2.2, MIT, gekopieerd uit `team/ejz/b-versie/assets/anime.min.js`
- Bewegingsidee: X-post van Bitmap Studio / @magdiel_rb, 25-11-2026
- Headsetgroen naar het Bitmap-voorbeeld (`#3F8C66`)
