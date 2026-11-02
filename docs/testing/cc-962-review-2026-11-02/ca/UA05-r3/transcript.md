# UA05-r3 — Wklejona tabela dwóch sektorów

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:55:49.033Z — 2026-11-01T10:56:25.422Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam małą tabelę dla naszego miasta. Czy możesz dodać te dane do inwentaryzacji za 2024 rok?

| Rok | Kategoria | Scope | Emisje (tCO2e) |
|---|---|---|---:|
| 2024 | Budynki mieszkalne | Scope 1 | 1200 |
| 2024 | Transport drogowy | Scope 1 | 800 |
| 2024 | Suma | — | 2000 |

## Clima 1

Mogę pomóc przygotować dane do wprowadzenia, ale nie mogę ich bezpośrednio zapisać w inwentaryzacji z tego czatu.

Aby wskazać właściwą inwentaryzację za 2024 r., podaj proszę miasto (oraz nazwę inwentaryzacji, jeśli dla tego miasta i roku jest ich więcej niż jedna).

Do wprowadzenia:
- **Budynki mieszkalne** — Scope 1: **1 200 tCO₂e**
- **Transport drogowy** — Scope 1: **800 tCO₂e**
- **Łącznie**: **2 000 tCO₂e**

Wiersz „Suma” potraktuj jako kontrolę wyniku, a nie osobną pozycję emisyjną, żeby nie podwoić emisji.

Czas do końca odpowiedzi (wraz z UI): 10.1 s.

## Użytkownik 2

Suma 2000 ton jest tylko podsumowaniem tych dwóch wierszy. Jak mogę sprawdzić, że dane rzeczywiście trafiły do właściwego roku i nie policzą się podwójnie?

## Clima 2

Tak — potraktuj **2 000 tCO₂e wyłącznie jako sumę kontrolną**, nie jako trzeci rekord do wprowadzenia.

Po zapisaniu danych sprawdź w inwentaryzacji za **2024 r.**:

1. **Właściwy rok i inwentaryzację**  
   Upewnij się, że w nagłówku widnieje rok bazowy/sprawozdawczy **2024** oraz właściwe miasto i nazwa inwentaryzacji.

2. **Dwa rekordy źródłowe**  
   Powinny występować dokładnie:
   - Budynki mieszkalne, Scope 1 — **1 200 tCO₂e**
   - Transport drogowy, Scope 1 — **800 tCO₂e**

3. **Brak osobnego wpisu „Suma”**  
   Nie dodawaj kategorii „Suma” ani źródła emisji o wartości 2 000 tCO₂e. To najważniejsze zabezpieczenie przed podwójnym liczeniem.

4. **Kontrolę sumy sektorowej/całkowitej**  
   Łączna wartość dla tych dwóch pozycji powinna wynosić **2 000 tCO₂e**:
   \[
   1\,200 + 800 = 2\,000\ \text{tCO₂e}
   \]
   Jeśli widzisz **4 000 tCO₂e**, prawdopodobnie dodano zarówno dwa wiersze szczegółowe, jak i wiersz sumaryczny.

5. **Zakres i klasyfikację**  
   Zweryfikuj, że oba wpisy mają **Scope 1** oraz że każda pozycja została przypisana do właściwego sektora/kategorii. Nie wpisuj tych samych emisji ponownie w Scope 2, Scope 3 ani w innej nakładającej się kategorii.

Dobrą praktyką jest zachowanie tabeli źródłowej i krótkiej notatki: „Wartość 2 000 tCO₂e jest wyłącznie sumą kontrolną pozycji Budynki mieszkalne i Transport drogowy.”

Czas do końca odpowiedzi (wraz z UI): 9.8 s.

## Użytkownik 3

Czy te dwie wartości wystarczą, czy potrzebujesz ode mnie jeszcze jakichś szczegółów, zanim je wpiszę?

## Clima 3

Do samego wpisania wartości potrzebne są jeszcze podstawowe informacje, aby poprawnie przypisać je w inwentaryzacji:

- **Miasto i właściwa inwentaryzacja za 2024 r.** — szczególnie jeśli masz więcej niż jedną.
- **Źródło danych** dla każdej wartości, np. urząd miasta, operator sieci, statystyka paliw, model/szacowanie.
- **Metoda obliczenia**: czy 1 200 i 800 tCO₂e są już gotowymi emisjami, czy wynikają z danych aktywności × współczynników emisji.
- **Zakres organizacyjny/geograficzny**: czy dane obejmują całe miasto i pełny rok 2024.
- **Dokładniejsze przypisanie kategorii**:
  - dla budynków mieszkalnych: rodzaj paliwa/nośnika lub informacja, że to łączna wartość dla paliw spalanych na miejscu;
  - dla transportu drogowego: czy obejmuje cały ruch na terenie miasta, czy tylko flotę miejską / ruch mieszkańców.
- **Standard i GWP**, jeśli nie są już ustalone w inwentaryzacji — np. zestaw współczynników IPCC użyty do wyliczenia CO₂e.
- **Informacja o unikaniu nakładania danych**: potwierdzenie, że te emisje nie są już ujęte w innym imporcie lub źródle.

Jeśli liczby są już końcowymi wynikami w tCO₂e, nie musisz ponownie podawać współczynników emisji, ale warto zachować ich źródło i metodę do celów audytu.

Czas do końca odpowiedzi (wraz z UI): 10.1 s.
