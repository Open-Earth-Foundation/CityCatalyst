# UA05-r2 — Wklejona tabela dwóch sektorów

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:55:19.156Z — 2026-11-01T10:55:54.521Z.

[Nagranie](https://github.com/user-attachments/assets/b1bcfedf-0a67-4981-8a9d-66d8aeca76e9) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam małą tabelę dla naszego miasta. Czy możesz dodać te dane do inwentaryzacji za 2024 rok?

| Rok | Kategoria | Scope | Emisje (tCO2e) |
|---|---|---|---:|
| 2024 | Budynki mieszkalne | Scope 1 | 1200 |
| 2024 | Transport drogowy | Scope 1 | 800 |
| 2024 | Suma | — | 2000 |

## Clima 1

Mogę pomóc przygotować dane, ale nie mogę bezpośrednio zapisać ich do inwentaryzacji z tego czatu.

Dla 2024 r. dane do wprowadzenia to:
- **Budynki mieszkalne — Scope 1:** 1 200 tCO₂e
- **Transport drogowy — Scope 1:** 800 tCO₂e

**Suma:** 2 000 tCO₂e.
Sumy nie należy zwykle dodawać jako osobnej kategorii emisji, aby nie doszło do podwójnego liczenia — powinna wynikać z dwóch pozycji źródłowych.

W CityCatalyst wybierz inwentaryzację miasta za **2024**, a następnie dodaj lub zaktualizuj te dwie pozycje w odpowiednich sektorach. Jeśli podasz, w jakim układzie importu pracujesz, mogę przygotować tabelę w wymaganym formacie.

Czas do końca odpowiedzi (wraz z UI): 8.7 s.

## Użytkownik 2

Suma 2000 ton jest tylko podsumowaniem tych dwóch wierszy. Jak mogę sprawdzić, że dane rzeczywiście trafiły do właściwego roku i nie policzą się podwójnie?

## Clima 2

Aby to sprawdzić:

1. **Otwórz inwentaryzację z rokiem bazowym 2024** — upewnij się, że nagłówek/ustawienia inwentaryzacji wskazują właśnie 2024, a nie rok raportowania lub inny zapis roboczy.
2. **Sprawdź dwie pozycje źródłowe**:
   - Budynki mieszkalne, Scope 1: **1 200 tCO₂e**
   - Transport drogowy, Scope 1: **800 tCO₂e**
3. **Nie dodawaj wiersza „Suma” jako osobnej kategorii ani źródła danych.** Wartość **2 000 tCO₂e** powinna pojawić się wyłącznie jako automatyczne podsumowanie tych dwóch pozycji.
4. **Sprawdź podsumowanie emisji dla Scope 1**. Jeśli te są jedynymi wpisami w tym zakresie, suma powinna wynosić **2 000 tCO₂e**. Jeśli są też inne źródła Scope 1, sprawdź, czy wzrost całkowitej sumy względem wcześniejszej wartości wynosi dokładnie 2 000 tCO₂e.
5. **Sprawdź listę źródeł/danych wejściowych** po imporcie: powinny być widoczne tylko dwa rekordy emisji, bez trzeciego rekordu z kategorią „Suma”.

Jeżeli import wymaga pliku, usuń wiersz „Suma” przed wgraniem — zachowaj go tylko w swoim arkuszu jako kontrolę jakości.

Czas do końca odpowiedzi (wraz z UI): 11.1 s.

## Użytkownik 3

Czy te dwie wartości wystarczą, czy potrzebujesz ode mnie jeszcze jakichś szczegółów, zanim je wpiszę?

## Clima 3

Same wartości wystarczą tylko do prostego, ręcznego wpisu emisji w odpowiednich pozycjach Scope 1. Przed wprowadzeniem warto jednak mieć jeszcze:

- **Dokładną jednostkę i metodę obliczeń** — potwierdzenie, że 1 200 i 800 są już w **tCO₂e**, a nie np. w MWh, litrach paliwa czy tonach CO₂.
- **Okres danych** — czy dotyczą całego roku kalendarzowego 2024.
- **Granice inwentaryzacji** — czy obejmują całe miasto i zakres zgodny z Waszą inwentaryzacją.
- **Źródło danych** — np. urząd miasta, operator sieci, badanie ruchu, faktury paliwowe; przyda się do audytu i późniejszej aktualizacji.
- **Metodę przypisania kategorii**:
  - „Budynki mieszkalne” — jakie paliwa/zużycie obejmuje,
  - „Transport drogowy” — czy obejmuje ruch lokalny, tranzyt, pojazdy prywatne i/lub flotę miejską.
- **Ryzyko nakładania się danych** — potwierdzenie, że te wartości nie są już zawarte w innych rekordach, np. w zagregowanej kategorii budynków lub transportu.

Nie wpisuj osobno wiersza **„Suma: 2 000 tCO₂e”**. To tylko kontrolne podsumowanie dwóch rekordów.

Czas do końca odpowiedzi (wraz z UI): 9.1 s.
