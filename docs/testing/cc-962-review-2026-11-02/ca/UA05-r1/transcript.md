# UA05-r1 — Wklejona tabela dwóch sektorów

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:55:09.630Z — 2026-11-01T10:55:42.689Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam małą tabelę dla naszego miasta. Czy możesz dodać te dane do inwentaryzacji za 2024 rok?

| Rok | Kategoria | Scope | Emisje (tCO2e) |
|---|---|---|---:|
| 2024 | Budynki mieszkalne | Scope 1 | 1200 |
| 2024 | Transport drogowy | Scope 1 | 800 |
| 2024 | Suma | — | 2000 |

## Clima 1

Nie mogę bezpośrednio dodać danych do inwentaryzacji z poziomu czatu, ale możesz wprowadzić je w inwentaryzacji za 2024 r. jako:

- **Budynki mieszkalne — Scope 1:** 1 200 tCO₂e  
- **Transport drogowy — Scope 1:** 800 tCO₂e  

Łączna wartość wynosi **2 000 tCO₂e**. Wiersz „Suma” potraktuj jako kontrolę, a nie jako dodatkową pozycję emisyjną, aby nie podwoić emisji.

Czas do końca odpowiedzi (wraz z UI): 8.0 s.

## Użytkownik 2

Suma 2000 ton jest tylko podsumowaniem tych dwóch wierszy. Jak mogę sprawdzić, że dane rzeczywiście trafiły do właściwego roku i nie policzą się podwójnie?

## Clima 2

Tak — skoro **2 000 tCO₂e** jest wyłącznie sumą dwóch pozycji, nie dodawaj tego wiersza jako osobnej kategorii.

Aby sprawdzić poprawność w CityCatalyst:

1. Otwórz inwentaryzację z rokiem bazowym **2024** — upewnij się, że nie edytujesz innego roku.
2. Wprowadź tylko dwie pozycje:
   - Budynki mieszkalne, Scope 1: **1 200 tCO₂e**
   - Transport drogowy, Scope 1: **800 tCO₂e**
3. Nie twórz wpisu „Suma” / „Łącznie” jako źródła lub kategorii emisji.
4. Po zapisaniu sprawdź widok podsumowania emisji:
   - łączna wartość dla tych dwóch wpisów powinna wynosić **2 000 tCO₂e**;
   - udział sektorów powinien pokazywać odpowiednio **1 200** i **800 tCO₂e**, bez trzeciej pozycji na 2 000 tCO₂e.
5. Sprawdź listę źródeł/danych i wyszukaj „Suma” lub „2000”. Jeśli taki rekord został dodany, usuń go lub oznacz jako niewliczany.

Jeśli podasz nazwę miasta, mogę najpierw sprawdzić, czy masz dostępną właściwą inwentaryzację za 2024 r.

Czas do końca odpowiedzi (wraz z UI): 9.0 s.

## Użytkownik 3

Czy te dwie wartości wystarczą, czy potrzebujesz ode mnie jeszcze jakichś szczegółów, zanim je wpiszę?

## Clima 3

Do ręcznego wpisania tych dwóch wartości wystarczą podstawowe dane, które już masz: rok, kategoria, zakres i emisje.

Przed zapisem warto jeszcze potwierdzić:

- że wybrana inwentaryzacja dotyczy **2024 r.**;
- jednostkę: **tCO₂e**;
- przypisanie kategorii zgodne z układem sektorów w CityCatalyst:
  - **Budynki mieszkalne** → Scope 1, 1 200 tCO₂e,
  - **Transport drogowy** → Scope 1, 800 tCO₂e;
- czy wartości dotyczą całego miasta i pełnego roku 2024, a nie tylko części obszaru lub okresu;
- źródło danych oraz ewentualną metodę obliczeń — przyda się do dokumentacji i późniejszej weryfikacji;
- że **2 000 tCO₂e** pozostaje wyłącznie sumą kontrolną, bez osobnego wpisu.

Jeśli CityCatalyst wymaga dodatkowych pól przy dodawaniu źródła, najczęściej będą to nazwa źródła, okres pokrycia danych, jednostka oraz krótki opis/metoda.

Czas do końca odpowiedzi (wraz z UI): 9.8 s.
