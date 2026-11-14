# UC02-r2 — Skąd pochodzi proponowana wartość?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:02:17.420Z — 2026-11-01T11:03:07.721Z.

[Nagranie](https://github.com/user-attachments/assets/101a1e55-cb1a-4aba-8759-4f987683ce94) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przygotuj proszę propozycje dla energii stacjonarnej, żebym mogła sprawdzić źródła przed podjęciem decyzji.

## Clima 1

Przygotowuję propozycje na podstawie podłączonych źródeł. Gdy będą gotowe, pojawią się w panelu przeglądu do weryfikacji.

Czas do końca odpowiedzi (wraz z UI): 17.3 s.

## Użytkownik 2

Spójrzmy na propozycję SEEG dla budynków mieszkalnych, zakres 1 (I.1.1). Skąd pochodzą dane, jaki jest ich rok i jaką wartość proponujesz?

## Clima 2

Dla **budynków mieszkalnych, zakres 1 (I.1.1)** proponowane jest źródło **SEEG – Sistema de Estimativa de Emissão de Gases do Efeito Estufa**.

- **Zasięg danych:** poziom krajowy (Brazylia)
- **Rok źródła:** 2015
- **Proponowana wartość:** **1,117,504,701 kgCO₂e** (ok. **1,11 MtCO₂e**, 100-letni współczynnik GWP)
- **Dane wejściowe:** całkowite zużycie paliw w budynkach mieszkalnych; źródło nie podaje ilości aktywności ani jednostki zużycia paliwa.

Wartość pochodzi bezpośrednio z podłączonego zbioru SEEG, bez modelowego szacowania w tym przepływie.

Czas do końca odpowiedzi (wraz z UI): 9.0 s.

## Użytkownik 3

Czy te dane odpowiadają naszemu miastu i tej kategorii? Czego nie da się na ich podstawie stwierdzić?

## Clima 3

Częściowo.

**Dopasowanie do kategorii:** tak — SEEG jest przypisany bezpośrednio do **I.1.1: budynki mieszkalne, zakres 1, spalanie paliw w granicach miasta**.

**Dopasowanie do miasta i roku inwentaryzacji:** ograniczone. Źródło ma zasięg **krajowy dla Brazylii** i pochodzi z **2015 r.**, podczas gdy aktywna inwentaryzacja dotyczy **2022 r.** Nie jest to więc pomiar specyficzny dla São Paulo ani dla roku inwentaryzacyjnego.

Na tej podstawie **nie da się stwierdzić**:
- rzeczywistego zużycia paliw w São Paulo;
- podziału emisji według paliwa, typu budynku lub dzielnicy;
- czy poziom emisji z 2015 r. jest reprezentatywny dla 2022 r.;
- szczegółowej metodyki lub współczynników emisji, ponieważ w danych źródłowych nie podano aktywności ani jednostek zużycia paliwa.

Propozycja jest więc zgodna z kategorią, ale ma ograniczoną reprezentatywność geograficzną i czasową.

Czas do końca odpowiedzi (wraz z UI): 11.6 s.
