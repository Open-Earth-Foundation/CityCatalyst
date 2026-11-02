# UB02-r3 — Porównanie roczne bez mylenia wzrostu z przyczyną

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:57:15.863Z — 2026-11-01T10:57:51.592Z.

[Nagranie](https://github.com/user-attachments/assets/9b1d8927-5112-492e-b802-c2a1da4f1082) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przełożona pyta, jak zmieniły się emisje naszego miasta między inwentaryzacjami 2023 i 2024. Możesz to porównać?

## Clima 1

Porównałam inwentaryzacje Brzegu Nadziei za 2023 i 2024 (obie GPC Basic+ i współczynniki GWP AR6).

**Łączne emisje wzrosły z 1,5 mln tCO₂e do 1,8 mln tCO₂e** — o **300 tys. tCO₂e**, czyli **20%**.

| Sektor | 2023 | 2024 | Zmiana |
|---|---:|---:|---:|
| Energia stacjonarna | 750 tys. tCO₂e | 900 tys. tCO₂e | +150 tys. tCO₂e (+20%) |
| Transport | 500 tys. tCO₂e | 600 tys. tCO₂e | +100 tys. tCO₂e (+20%) |
| Odpady | 250 tys. tCO₂e | 300 tys. tCO₂e | +50 tys. tCO₂e (+20%) |

Struktura emisji pozostała taka sama: energia stacjonarna odpowiada za **50%**, transport za **33,3%**, a odpady za **16,7%** całkowitych emisji. Największe pozycje w 2024 r. to emisje z budynków mieszkalnych (zakres 1: 600 tys. tCO₂e; zakres 2: 300 tys. tCO₂e) oraz transport drogowy (600 tys. tCO₂e).

Warto zaznaczyć, że w obu latach dane są ręcznie wprowadzone lub przesłane, a sektory IPPU i AFOLU nie mają wypełnionych danych.

Czas do końca odpowiedzi (wraz z UI): 11.7 s.

## Użytkownik 2

O ile to się zmieniło w tonach i w procentach względem 2023 roku?

## Clima 2

Łączne emisje **wzrosły o 300 000 tCO₂e**, z 1 500 000 tCO₂e w 2023 r. do 1 800 000 tCO₂e w 2024 r.

To oznacza wzrost o **20% względem 2023 r.**

Czas do końca odpowiedzi (wraz z UI): 8.0 s.

## Użytkownik 3

Czy na tej podstawie mogę stwierdzić, że mieszkańcy zużyli więcej energii? Co powinnam zaznaczyć w notatce?

## Clima 3

Nie wprost. Na podstawie tych danych możesz stwierdzić, że **emisje przypisane do energii stacjonarnej wzrosły o 150 000 tCO₂e (20%)**. W szczególności emisje z budynków mieszkalnych wzrosły:

- **zakres 1:** o 100 000 tCO₂e (z 500 000 do 600 000),
- **zakres 2:** o 50 000 tCO₂e (z 250 000 do 300 000).

To **może** wskazywać na większe zużycie energii lub paliw przez mieszkańców, ale sama inwentaryzacja emisji tego nie potwierdza. Wzrost może też wynikać m.in. ze zmiany wskaźników emisyjności energii elektrycznej lub paliw, zakresu danych, metodyki albo kompletności raportowania.

**Proponowany zapis do notatki:**

> Między 2023 a 2024 r. emisje z energii stacjonarnej wzrosły o 150 tys. tCO₂e, tj. o 20%. Wzrost dotyczy przede wszystkim budynków mieszkalnych, zarówno emisji bezpośrednich (zakres 1), jak i pośrednich związanych z zakupioną energią elektryczną (zakres 2). Wynik nie pozwala jednak samodzielnie przesądzić o wzroście zużycia energii przez mieszkańców. Wymaga weryfikacji danych o zużyciu paliw i energii, wskaźników emisyjności oraz porównywalności metodyki między latami.

Warto także zaznaczyć, że oba zestawy danych są wprowadzone ręcznie lub przesłane, a sektory IPPU i AFOLU nie są wypełnione.

Czas do końca odpowiedzi (wraz z UI): 9.6 s.
