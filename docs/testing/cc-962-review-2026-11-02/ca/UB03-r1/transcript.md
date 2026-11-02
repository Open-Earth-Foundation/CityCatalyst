# UB03-r1 — Co naprawdę oznaczają zakresy w energii

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:57:25.638Z — 2026-11-01T10:58:01.284Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

W wynikach za 2024 rok chcę lepiej zrozumieć energię stacjonarną. Ile przypada na zakres 1, a ile na zakres 2?

## Clima 1

W inwentaryzacji za 2024 r. energia stacjonarna wynosi łącznie **900 000 tCO₂e** (50% całkowitych emisji miasta):

- **Zakres 1:** **600 000 tCO₂e**
- **Zakres 2:** **300 000 tCO₂e**

Obie wartości dotyczą przede wszystkim budynków mieszkalnych. Zakres 1 jest więc dwukrotnie większy niż zakres 2.

Czas do końca odpowiedzi (wraz z UI): 11.3 s.

## Użytkownik 2

Jak mam prostym językiem wyjaśnić przełożonej różnicę między tymi zakresami?

## Clima 2

Najprościej:

- **Zakres 1** to emisje powstające **bezpośrednio na miejscu** — np. gdy mieszkańcy ogrzewają domy gazem, węglem lub olejem opałowym. W energii stacjonarnej to **600 tys. tCO₂e**.
- **Zakres 2** to emisje związane z **zakupioną energią elektryczną lub ciepłem**, które są wytwarzane gdzie indziej, ale zużywane w mieście. To **300 tys. tCO₂e**.

Możesz powiedzieć przełożonej:

> „W zakresie 1 liczymy spalanie paliw w budynkach, np. w piecach i kotłach. W zakresie 2 liczymy emisje z produkcji prądu lub ciepła kupowanego przez mieszkańców i firmy. Dlatego zakres 1 pokazuje lokalne spalanie paliw, a zakres 2 — ślad emisyjny energii dostarczanej z zewnątrz.”

W wynikach za 2024 r. większym problemem jest **zakres 1** — jest dwukrotnie wyższy od zakresu 2.

Czas do końca odpowiedzi (wraz z UI): 8.5 s.

## Użytkownik 3

Czy te liczby składają się na cały wynik energii i czy oznacza to, że nie brakuje nam tam żadnych danych?

## Clima 3

Tak — dla energii stacjonarnej te dwie wartości składają się na wykazany wynik:

- Zakres 1: **600 tys. tCO₂e**
- Zakres 2: **300 tys. tCO₂e**
- **Razem: 900 tys. tCO₂e**

To odpowiada całemu wynikowi sektora energii stacjonarnej w inwentaryzacji 2024.

Nie można jednak na tej podstawie jednoznacznie stwierdzić, że nie brakuje żadnych danych źródłowych w tym sektorze. W podsumowaniu inwentaryzacji energia stacjonarna jest wypełniona, a brakujące sektory wskazano gdzie indziej: **IPPU i AFOLU**. Wartości dla energii stacjonarnej pochodzą z danych wprowadzonych ręcznie lub załadowanych, więc ich kompletność zależy od zakresu tych danych.

Czas do końca odpowiedzi (wraz z UI): 8.6 s.
