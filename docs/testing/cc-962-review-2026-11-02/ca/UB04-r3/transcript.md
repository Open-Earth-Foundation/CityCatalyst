# UB04-r3 — Wskaźnik na mieszkańca i kontrola jednostek

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:59:33.619Z — 2026-11-01T11:00:15.003Z.

[Nagranie](https://github.com/user-attachments/assets/6ecbfbbd-e15a-4b98-aeeb-18c192defedd) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Do notatki potrzebuję emisji na jednego mieszkańca za 2024 rok, z jednostką. Możesz to obliczyć i powiedzieć, z jakich danych korzystasz?

## Clima 1

Mogę to obliczyć, ale w dostępnych danych brakuje liczby mieszkańców dla 2024 r.

Dla inwentaryzacji **Brzeg Nadziei (test), 2024** całkowite emisje wynoszą:

- **1 800 000 000 kg CO₂e**, czyli **1 800 000 t CO₂e**

Wzór:
**emisje na mieszkańca = 1 800 000 t CO₂e ÷ liczba mieszkańców w 2024 r.**

Wynik podam w **t CO₂e/mieszkańca/rok** (ewentualnie także w kg CO₂e/mieszkańca/rok).

Korzystam z:
- całkowitych emisji z inwentaryzacji GPC Basic+ za 2024 r. (GWP AR6),
- liczby ludności miasta za 2024 r. — tej wartości nie ma obecnie w danych inwentaryzacji.

Podaj proszę liczbę mieszkańców (i źródło, jeśli ma być wskazane w notatce), a wyliczę wskaźnik.

Czas do końca odpowiedzi (wraz z UI): 13.4 s.

## Użytkownik 2

W danych miasta mam 100 tysięcy mieszkańców. Czy przy tej liczbie możesz przeliczyć wynik i pokazać działanie?

## Clima 2

Tak.

**Dane:**
- Emisje całkowite w 2024 r.: **1 800 000 t CO₂e**
- Liczba mieszkańców: **100 000**

**Obliczenie:**

\[
\frac{1\,800\,000\ \text{t CO₂e}}{100\,000\ \text{mieszkańców}}
= 18\ \text{t CO₂e/mieszkańca/rok}
\]

**Wynik: 18 t CO₂e na mieszkańca rocznie**
czyli **18 000 kg CO₂e/mieszkańca/rok**.

Do obliczenia wykorzystano całkowite emisje z inwentaryzacji miasta za 2024 r. (GPC Basic+, współczynniki GWP AR6) oraz podaną przez Ciebie liczbę 100 tys. mieszkańców.

Czas do końca odpowiedzi (wraz z UI): 8.4 s.

## Użytkownik 3

A ile wynosił ten wskaźnik w 2023 roku przy tej samej liczbie mieszkańców? Czy mogę go traktować jako pełny wynik dla miasta?

## Clima 3

Dla 2023 r. całkowite emisje wynosiły **1 500 000 t CO₂e**.

Przy tej samej liczbie ludności — **100 000 mieszkańców**:

\[
\frac{1\,500\,000\ \text{t CO₂e}}{100\,000\ \text{mieszkańców}}
= 15\ \text{t CO₂e/mieszkańca/rok}
\]

**Wskaźnik za 2023 r.: 15 t CO₂e/mieszkańca/rok**
czyli **15 000 kg CO₂e/mieszkańca/rok**.

Dla porównania, w 2024 r. wskaźnik wyniósł **18 t CO₂e/mieszkańca/rok**, więc przy stałej liczbie mieszkańców wzrósł o **3 t CO₂e/osobę**, czyli **20%**.

Nie traktowałbym go jednak jako w pełni kompletnego wyniku dla miasta. Inwentaryzacja 2023 jest GPC Basic+ i obejmuje wypełnione dane dla energii stacjonarnej, transportu i odpadów, ale sektory **IPPU** oraz **AFOLU** nie mają wprowadzonych danych. Wskaźnik jest więc poprawny dla obecnie ujętych emisji, lecz może nie obejmować wszystkich źródeł emisji miejskich.

Czas do końca odpowiedzi (wraz z UI): 12.5 s.
