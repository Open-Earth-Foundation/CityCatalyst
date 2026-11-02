# UB04-r1 — Wskaźnik na mieszkańca i kontrola jednostek

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:58:44.210Z — 2026-11-01T10:59:26.813Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Do notatki potrzebuję emisji na jednego mieszkańca za 2024 rok, z jednostką. Możesz to obliczyć i powiedzieć, z jakich danych korzystasz?

## Clima 1

Dla inwentaryzacji **Brzeg Nadziei (test), 2024** całkowite emisje wynoszą **1 800 000 000 kg CO₂e**, czyli **1 800 000 t CO₂e**.

Aby obliczyć emisje na mieszkańca, brakuje mi jeszcze **liczby mieszkańców w 2024 r.**. Wzór jest następujący:

**emisje per capita = 1 800 000 t CO₂e ÷ liczba mieszkańców**  
Wynik: **t CO₂e/mieszkańca/rok**.

Korzystam z:
- całkowitych emisji z inwentaryzacji GPC Basic+ za 2024 r. (GWP: AR6),
- danych wpisanych ręcznie lub przesłanych do inwentaryzacji,
- liczby ludności za 2024 r. — potrzebuję jej od Ciebie, ponieważ nie jest dostępna w danych inwentaryzacyjnych.

Uwaga: inwentaryzacja jest obecnie wypełniona w 8% (4 z 48 wymaganych pozycji), więc wskaźnik będzie oparty na niepełnym zestawie danych. Podaj liczbę mieszkańców, a wyliczę dokładną wartość.

Czas do końca odpowiedzi (wraz z UI): 12.9 s.

## Użytkownik 2

W danych miasta mam 100 tysięcy mieszkańców. Czy przy tej liczbie możesz przeliczyć wynik i pokazać działanie?

## Clima 2

Tak.

**Obliczenie:**

- Całkowite emisje w 2024 r.: **1 800 000 000 kg CO₂e**
- Liczba mieszkańców: **100 000**

\[
\frac{1\,800\,000\,000\ \text{kg CO₂e}}{100\,000\ \text{mieszkańców}}
= 18\,000\ \text{kg CO₂e/mieszkańca/rok}
\]

czyli:

\[
\mathbf{18\ t\ CO₂e/mieszkańca/rok}
\]

**Wynik do notatki:** w 2024 r. emisje wyniosły **18 t CO₂e na mieszkańca rocznie**.

Wykorzystane dane: całkowite emisje z inwentaryzacji GPC Basic+ za 2024 r. (GWP AR6) oraz podana przez Ciebie liczba **100 000 mieszkańców**. Warto pamiętać, że inwentaryzacja jest obecnie uzupełniona w 8%, więc wskaźnik dotyczy zgłoszonych dotąd emisji.

Czas do końca odpowiedzi (wraz z UI): 9.6 s.

## Użytkownik 3

A ile wynosił ten wskaźnik w 2023 roku przy tej samej liczbie mieszkańców? Czy mogę go traktować jako pełny wynik dla miasta?

## Clima 3

Dla 2023 r. całkowite emisje wynoszą **1 500 000 000 kg CO₂e** (czyli **1 500 000 t CO₂e**).

Przy tej samej liczbie **100 000 mieszkańców**:

\[
\frac{1\,500\,000\,000\ \text{kg CO₂e}}{100\,000\ \text{mieszkańców}}
= 15\,000\ \text{kg CO₂e/mieszkańca/rok}
\]

czyli **15 t CO₂e/mieszkańca/rok**.

Nie należy jednak traktować tego jako pełnego wyniku dla miasta. Inwentaryzacja za 2023 r. jest uzupełniona tylko w **8%**: wypełniono 4 z 48 wymaganych pozycji. Uwzględnia obecnie część emisji z:
- energii stacjonarnej,
- transportu,
- odpadów,

natomiast sektory **IPPU** i **AFOLU** nie mają wprowadzonych danych, a w powyższych sektorach również brakuje wielu pozycji.

Najlepiej opisać ten wskaźnik jako **wstępny wynik oparty na obecnie wprowadzonych danych**, a nie pełną emisję per capita miasta. Porównanie z 2024 r. (18 t CO₂e/mieszkańca/rok) ma sens jedynie warunkowo — oba lata mają podobny, niski poziom uzupełnienia, ale wzrost może odzwierciedlać zmianę zakresu lub danych, nie tylko rzeczywistą zmianę emisji.

Czas do końca odpowiedzi (wraz z UI): 13.0 s.
