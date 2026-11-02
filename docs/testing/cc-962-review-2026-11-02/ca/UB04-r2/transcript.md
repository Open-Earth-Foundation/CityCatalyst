# UB04-r2 — Wskaźnik na mieszkańca i kontrola jednostek

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:58:52.763Z — 2026-11-01T10:59:35.472Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Do notatki potrzebuję emisji na jednego mieszkańca za 2024 rok, z jednostką. Możesz to obliczyć i powiedzieć, z jakich danych korzystasz?

## Clima 1

Dla inwentaryzacji **Brzeg Nadziei (test), 2024** całkowite emisje wynoszą **1 800 000 000 kg CO₂e**, czyli **1 800 000 t CO₂e**.

Aby obliczyć emisje na mieszkańca, brakuje mi jeszcze **liczby mieszkańców miasta w 2024 r.** Wzór:

**emisje per capita = 1 800 000 t CO₂e ÷ liczba mieszkańców = t CO₂e/mieszkańca**

Korzystałbym z:
- **całkowitych emisji GHG za 2024 r.** z inwentaryzacji GPC Basic+ (GWP AR6),
- **populacji miasta za 2024 r.** jako mianownika.

Uwaga: inwentaryzacja jest obecnie wypełniona w **8%** (4 z 48 wymaganych pól), więc wynik obejmie tylko ujęte dane: energię stacjonarną, transport i odpady. Podaj liczbę mieszkańców, a wyliczę wskaźnik z jednostką.

Czas do końca odpowiedzi (wraz z UI): 14.9 s.

## Użytkownik 2

W danych miasta mam 100 tysięcy mieszkańców. Czy przy tej liczbie możesz przeliczyć wynik i pokazać działanie?

## Clima 2

Tak.

**Działanie:**

- Emisje całkowite w 2024 r.: **1 800 000 t CO₂e**
- Liczba mieszkańców: **100 000**

\[
\frac{1\,800\,000\ \text{t CO₂e}}{100\,000\ \text{mieszkańców}}
= 18\ \text{t CO₂e/mieszkańca}
\]

**Wynik: 18 t CO₂e na mieszkańca w 2024 r.**

Do obliczenia użyto całkowitych emisji z inwentaryzacji GPC Basic+ (GWP AR6) oraz podanej przez Ciebie populacji. Warto pamiętać, że inwentaryzacja jest obecnie wypełniona w 8%, więc wskaźnik dotyczy tylko dotąd ujętych emisji.

Czas do końca odpowiedzi (wraz z UI): 8.6 s.

## Użytkownik 3

A ile wynosił ten wskaźnik w 2023 roku przy tej samej liczbie mieszkańców? Czy mogę go traktować jako pełny wynik dla miasta?

## Clima 3

Dla 2023 r. całkowite emisje w inwentaryzacji wynoszą **1 500 000 t CO₂e**.

Przy tej samej liczbie mieszkańców (**100 000**) obliczenie jest następujące:

\[
\frac{1\,500\,000\ \text{t CO₂e}}{100\,000\ \text{mieszkańców}}
= 15\ \text{t CO₂e/mieszkańca}
\]

**Wskaźnik za 2023 r.: 15 t CO₂e/mieszkańca.**

Nie należy jednak traktować go jako pełnego wyniku dla całego miasta. Inwentaryzacja za 2023 r. jest wypełniona w **8%**: ujęto dane dla energii stacjonarnej, transportu i odpadów, ale sektory **IPPU** i **AFOLU** nie mają jeszcze wprowadzonych danych, a większość wymaganych pól w pozostałych sektorach również jest pusta.

Możesz traktować **15 t CO₂e/mieszkańca** jako wskaźnik dla **dotychczas zarejestrowanego zakresu emisji**, a nie jako kompletny ślad emisji miasta. Porównanie z 2024 r. (18 t CO₂e/mieszkańca) jest technicznie spójne, ponieważ oba lata mają ten sam poziom wypełnienia i podobny zakres ujętych sektorów, ale nie zastępuje pełnej inwentaryzacji.

Czas do końca odpowiedzi (wraz z UI): 12.1 s.
