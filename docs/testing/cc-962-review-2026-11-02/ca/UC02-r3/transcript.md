# UC02-r3 — Skąd pochodzi proponowana wartość?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:02:45.949Z — 2026-11-01T11:03:32.401Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przygotuj proszę propozycje dla energii stacjonarnej, żebym mogła sprawdzić źródła przed podjęciem decyzji.

## Clima 1

Przygotowuję propozycje; gdy będą gotowe, pojawią się w panelu przeglądu źródeł.

Czas do końca odpowiedzi (wraz z UI): 16.0 s.

## Użytkownik 2

Spójrzmy na propozycję SEEG dla budynków mieszkalnych, zakres 1 (I.1.1). Skąd pochodzą dane, jaki jest ich rok i jaką wartość proponujesz?

## Clima 2

Dla **budynków mieszkalnych — zakres 1 (I.1.1)** proponowane jest źródło **SEEG (Sistema de Estimativa de Emissão de Gases do Efeito Estufa)**.

- **Zasięg danych:** krajowy dla Brazylii  
- **Rok danych:** **2015**
- **Proponowana wartość:** **1,117,504,701 kgCO₂e** (ok. **1,12 MtCO₂e**, horyzont 100-letni)

Wartość obejmuje CO₂, CH₄ i N₂O ze spalania paliw w budynkach mieszkalnych. W danych źródłowych nie podano wartości aktywności ani jej jednostki.

Czas do końca odpowiedzi (wraz z UI): 8.4 s.

## Użytkownik 3

Czy te dane odpowiadają naszemu miastu i tej kategorii? Czego nie da się na ich podstawie stwierdzić?

## Clima 3

Częściowo.

- **Kategoria:** tak — dane SEEG są przypisane dokładnie do **I.1.1: Budynki mieszkalne, zakres 1, spalanie paliw w granicach miasta**.
- **Miasto:** nie w pełni — źródło ma dopasowanie **krajowe (Brazylia)**, a nie bezpośrednio do São Paulo.
- **Rok:** nie — propozycja opiera się na danych z **2015 r.**, podczas gdy inwentaryzacja dotyczy **2022 r.**

Na tej podstawie nie da się wiarygodnie stwierdzić:
- czy wartość odzwierciedla rzeczywiste zużycie paliw w São Paulo w 2022 r.;
- jak emisje rozkładają się między paliwa, typy budynków lub dzielnice;
- jaka była aktywność energetyczna (np. ilość zużytego paliwa) — źródło nie podaje wartości ani jednostki aktywności;
- czy od 2015 r. nastąpiły lokalne zmiany w paliwach, efektywności energetycznej lub strukturze zabudowy.

To jest więc zgodne **tematycznie**, ale ma ograniczoną reprezentatywność **czasową i geograficzną**.

Czas do końca odpowiedzi (wraz z UI): 10.2 s.
