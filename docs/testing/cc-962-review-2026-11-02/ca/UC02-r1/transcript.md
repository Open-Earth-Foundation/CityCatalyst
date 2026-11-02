# UC02-r1 — Skąd pochodzi proponowana wartość?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:46:34.122Z — 2026-11-01T10:47:19.079Z.

[Nagranie](https://github.com/user-attachments/assets/b1d7bf44-addd-4d63-9348-611fe9c8d159) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przygotuj proszę propozycje dla energii stacjonarnej, żebym mogła sprawdzić źródła przed podjęciem decyzji.

## Clima 1

Przygotowuję propozycje ze źródłami. Gdy będą gotowe, pojawią się w panelu przeglądu do sprawdzenia przed zapisaniem.

Czas do końca odpowiedzi (wraz z UI): 14.4 s.

## Użytkownik 2

Spójrzmy na propozycję SEEG dla budynków mieszkalnych, zakres 1 (I.1.1). Skąd pochodzą dane, jaki jest ich rok i jaką wartość proponujesz?

## Clima 2

Dla **I.1.1 — budynki mieszkalne, zakres 1** proponowane jest źródło **SEEG (Sistema de Estimativa de Emissão de Gases do Efeito Estufa)**.

- **Zasięg danych:** krajowy (Brazylia)
- **Rok źródła:** 2015
- **Proponowana wartość:** **1 117 504 701 kg CO₂e** (ok. **1,12 MtCO₂e**, horyzont 100-letni)
- **Składowe:** CO₂ 1 111 223 686 kg, CH₄ 19 335 kg i N₂O 21 659 kg.

Źródło nie zawiera wartości zużycia paliwa ani jednostki aktywności; udostępnia bezpośrednio emisje.

Czas do końca odpowiedzi (wraz z UI): 8.3 s.

## Użytkownik 3

Czy te dane odpowiadają naszemu miastu i tej kategorii? Czego nie da się na ich podstawie stwierdzić?

## Clima 3

**Kategoria jest zgodna:** propozycja SEEG została przypisana dokładnie do **I.1.1 — zakres 1, budynki mieszkalne, spalanie paliw w granicach miasta**.

**Dopasowanie do miasta jest ograniczone:** źródło ma zasięg **krajowy**, a nie miejski, i dotyczy **2015 r.**, podczas gdy aktywny inwentarz jest za **2022 r.** To oznacza, że nie jest to pomiar specyficzny dla São Paulo ani dla roku inwentaryzacji.

Na tej podstawie nie da się ustalić:
- faktycznych emisji mieszkaniowych w granicach miasta w 2022 r.;
- zużycia paliw ani jego jednostki;
- podziału emisji według rodzaju paliwa, typu budynków lub dzielnic;
- lokalnych współczynników emisji i założeń użytych do przeliczenia.

SEEG dostarcza tu bezpośrednią wartość emisji dla właściwej kategorii, ale jako dane krajowe z wcześniejszego roku należy ją traktować jako ograniczoną reprezentację lokalnej sytuacji.

Czas do końca odpowiedzi (wraz z UI): 10.2 s.
