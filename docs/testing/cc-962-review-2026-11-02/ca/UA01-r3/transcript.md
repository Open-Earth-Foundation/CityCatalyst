# UA01-r3 — Pierwsza inwentaryzacja za nowy rok

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:51:42.294Z — 2026-11-01T10:52:11.533Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Dzień dobry, zaczynam pracę z CityCatalyst. Chciałabym przygotować inwentaryzację emisji naszego miasta za 2025 rok. Od czego mam zacząć i czy możesz ją dla mnie utworzyć?

## Clima 1

Dzień dobry! Aby przygotować inwentaryzację emisji miasta za **2025 r.**, zacznij od:

1. **Utworzenia nowej inwentaryzacji** w CityCatalyst  
   Wybierz miasto, rok raportowania **2025**, typ inwentaryzacji oraz stosowany współczynnik GWP.

2. **Ustalenia granic i metodologii**  
   Określ granice administracyjne miasta, sektory do uwzględnienia oraz metodę zgodną z GPC, jeśli jest wymagana.

3. **Zebrania danych aktywności**  
   Zwykle obejmują one m.in.:
   - zużycie energii elektrycznej i paliw w budynkach,
   - transport drogowy i publiczny,
   - odpady i ścieki,
   - przemysł, jeśli mieści się w zakresie inwentaryzacji,
   - lokalne źródła energii odnawialnej.

4. **Dodania źródeł danych i współczynników emisji**  
   Dla każdej danej warto zapisać źródło, rok danych, jednostki, zasięg oraz zastosowany współczynnik emisji.

5. **Sprawdzenia kompletności i wyników**  
   Po wprowadzeniu danych zweryfikuj brakujące sektory, całkowite emisje oraz największe źródła emisji.

Nie mogę bezpośrednio utworzyć inwentaryzacji w Twoim imieniu z poziomu tej rozmowy, ale mogę przeprowadzić Cię krok po kroku przez konfigurację i pomóc przygotować listę potrzebnych danych.  

Na początek: czy masz już w CityCatalyst wybrane miasto oraz dostęp do danych za 2025 r., np. od operatorów energii, transportu i gospodarki odpadami?

Czas do końca odpowiedzi (wraz z UI): 11.4 s.

## Użytkownik 2

Co powinnam wybrać w ustawieniach i gdzie potem sprawdzę, czy rok 2025 rzeczywiście jest już dostępny?

## Clima 2

W ustawieniach nowej inwentaryzacji wybierz przede wszystkim:

- **Miasto** – właściwą jednostkę samorządową i jej granice administracyjne.
- **Rok inwentaryzacji:** **2025**.
- **Typ inwentaryzacji / zakres raportowania** – zgodny z celem raportowania miasta; jeśli przygotowujecie standardową inwentaryzację miejską, stosujcie podejście zgodne z **GPC**.
- **GWP (potencjał tworzenia efektu cieplarnianego)** – wybierz jeden zestaw współczynników i stosuj go konsekwentnie w całej inwentaryzacji. Jeśli macie wymogi programu lub finansującego, kierujcie się nimi.
- **Granice** – administracyjne granice miasta oraz jasno określone źródła i sektory objęte obliczeniami.
- **Waluta i jednostki** – najlepiej zgodne z lokalnymi danymi źródłowymi; system przeliczy je tam, gdzie jest to skonfigurowane.

Aby później potwierdzić, że inwentaryzacja za 2025 r. jest dostępna:

1. Otwórz listę inwentaryzacji dla danego miasta.
2. Wyszukaj lub przefiltruj po roku **2025**.
3. Sprawdź, czy na liście widnieje pozycja „[miasto] – 2025”.
4. Otwórz ją i sprawdź status kompletności sektorów oraz metadane inwentaryzacji.

Jeśli w wykazie nie ma 2025 r., oznacza to zwykle, że inwentaryzacja nie została jeszcze utworzona albo nie masz do niej uprawnień. Po jej utworzeniu możesz sukcesywnie uzupełniać dane sektorowe i sprawdzać postęp w widoku statusu.

Czas do końca odpowiedzi (wraz z UI): 9.7 s.
