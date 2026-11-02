# UB02-r1 — Porównanie roczne bez mylenia wzrostu z przyczyną

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:56:32.512Z — 2026-11-01T10:57:09.052Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przełożona pyta, jak zmieniły się emisje naszego miasta między inwentaryzacjami 2023 i 2024. Możesz to porównać?

## Clima 1

Tak. Dla **Brzegu Nadziei** całkowite emisje wzrosły z **1,50 MtCO₂e w 2023 r.** do **1,80 MtCO₂e w 2024 r.** — czyli o **0,30 MtCO₂e (300 tys. tCO₂e), +20%**.

| Sektor | 2023 | 2024 | Zmiana |
|---|---:|---:|---:|
| Energia stacjonarna | 0,75 MtCO₂e | 0,90 MtCO₂e | +0,15 MtCO₂e |
| Transport | 0,50 MtCO₂e | 0,60 MtCO₂e | +0,10 MtCO₂e |
| Odpady | 0,25 MtCO₂e | 0,30 MtCO₂e | +0,05 MtCO₂e |

Struktura emisji nie zmieniła się: energia stacjonarna stanowiła **50%**, transport **33,3%**, a odpady **16,7%** w obu latach. Największe źródła w 2024 r. to emisje z budynków mieszkalnych (zakres 1: 0,60 MtCO₂e) oraz transport drogowy (0,60 MtCO₂e).

Ważne zastrzeżenie: oba zestawienia mają ten sam zakres i współczynniki GWP (GPC Basic+, AR6), a dane są wprowadzone ręcznie lub zaimportowane. IPPU i AFOLU nie mają wypełnionych danych w żadnym z tych lat.

Czas do końca odpowiedzi (wraz z UI): 12.4 s.

## Użytkownik 2

O ile to się zmieniło w tonach i w procentach względem 2023 roku?

## Clima 2

Emisje wzrosły o **300 000 tCO₂e** — z **1 500 000 tCO₂e w 2023 r.** do **1 800 000 tCO₂e w 2024 r.**

To oznacza wzrost o **20% względem 2023 r.**  
\[
\frac{1{,}800{,}000 - 1{,}500{,}000}{1{,}500{,}000} \times 100\% = 20\%
\]

Czas do końca odpowiedzi (wraz z UI): 7.4 s.

## Użytkownik 3

Czy na tej podstawie mogę stwierdzić, że mieszkańcy zużyli więcej energii? Co powinnam zaznaczyć w notatce?

## Clima 3

Nie — na podstawie samych emisji nie można jednoznacznie stwierdzić, że mieszkańcy zużyli więcej energii.

Można natomiast napisać, że **emisje z energii stacjonarnej wzrosły o 150 000 tCO₂e** (z 750 000 do 900 000 tCO₂e, czyli o **20%**). Wśród największych źródeł wzrosły emisje związane z budynkami mieszkalnymi:
- zakres 1: z 500 000 do 600 000 tCO₂e,
- zakres 2: z 250 000 do 300 000 tCO₂e.

**Proponowany zapis do notatki:**

> Między 2023 a 2024 r. całkowite emisje miasta wzrosły o 300 000 tCO₂e (+20%). Emisje z energii stacjonarnej wzrosły o 150 000 tCO₂e (+20%), w tym wzrosły emisje przypisane do budynków mieszkalnych. Wynik ten może wskazywać na większe zużycie energii, ale nie potwierdza go jednoznacznie. Na zmianę mogły wpłynąć również m.in. struktura paliw, wskaźniki emisji energii elektrycznej, warunki pogodowe, liczba odbiorców lub kompletność danych.

Warto dopisać, że oba lata mają ten sam zakres inwentaryzacji (GPC Basic+, AR6), ale dane sektorowe są ręcznie wprowadzone lub importowane. Aby potwierdzić wzrost zużycia energii, należałoby porównać dane o zużyciu prądu, gazu i paliw — najlepiej także w przeliczeniu na mieszkańca oraz z uwzględnieniem stopniodni grzewczych.

Czas do końca odpowiedzi (wraz z UI): 10.5 s.
