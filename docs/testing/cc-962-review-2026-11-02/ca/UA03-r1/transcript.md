# UA03-r1 — Posiadany arkusz Excel

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:52:42.800Z — 2026-11-01T10:53:26.630Z.

[Nagranie](https://github.com/user-attachments/assets/12be3270-5d75-4fe8-9a81-11f1dec0a0da) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam naszą wcześniejszą inwentaryzację w Excelu i chciałabym wykorzystać ją w CityCatalyst. Jak mogę ją wprowadzić, żeby nie przepisywać wszystkiego ręcznie?

## Clima 1

Jeśli masz wcześniejszą inwentaryzację w Excelu, najlepiej przygotować ją do importu zamiast przepisywać pozycje ręcznie.

1. **Uporządkuj arkusz** – jedna pozycja emisji w wierszu, z jasnymi kolumnami, np.:
   - sektor / podsektor,
   - źródło emisji lub aktywność,
   - rok inwentaryzacji,
   - wartość aktywności i jednostka,
   - emisje (jeśli już policzone) i jednostka,
   - współczynnik emisji oraz źródło danych/metodologia.

2. **Zachowaj dane źródłowe**, nie tylko sumy sektorowe. CityCatalyst zwykle wymaga danych na poziomie źródła/aktywności, aby można było zweryfikować obliczenia i przypisać je do właściwych kategorii.

3. **Dopasuj kategorie do struktury inwentaryzacji** (np. energia stacjonarna, transport, odpady; ewentualnie zakresy emisji), zanim załadujesz plik. To ogranicza późniejsze ręczne przypisywanie.

4. **Sprawdź jednostki i rok** – szczególnie MWh vs kWh, litry vs m³ oraz tCO₂e. Upewnij się też, że cały plik dotyczy tego samego roku referencyjnego albo że lata są wyraźnie oznaczone.

5. **Zaimportuj przez dostępny w Twoim projekcie proces dodawania danych/źródeł danych**. Jeśli w widoku inwentaryzacji nie ma opcji importu arkusza, dane trzeba będzie wprowadzić przez formularze lub użyć szablonu importowego udostępnionego w projekcie.

Przed importem warto zrobić kopię pliku i usunąć formuły zależne od zewnętrznych arkuszy. Jeśli opiszesz układ obecnego Excela — nazwy arkuszy i kolumn, bez przesyłania wrażliwych danych — pomogę przygotować mapowanie do struktury CityCatalyst.

Czas do końca odpowiedzi (wraz z UI): 11.6 s.

## Użytkownik 2

Czy mogę przesłać ten plik tutaj? Jak przed zatwierdzeniem sprawdzę rok, jednostki i przypisanie danych do sektorów?

## Clima 2

Możesz przesłać plik Excel w tym czacie, jeśli opcja załączników jest dostępna w Twoim interfejsie. Mogę wtedy pomóc przejrzeć jego strukturę i wskazać kwestie do poprawy przed wprowadzeniem danych do CityCatalyst.

Przed zatwierdzeniem sprawdź:

- **Rok inwentaryzacji:** czy każdy rekord ma właściwy rok referencyjny i czy nie mieszają się dane z różnych lat. Jeśli użyto danych zastępczych, oznacz ich rok źródłowy osobno.
- **Jednostki aktywności:** np. kWh/MWh dla energii, litry/m³ dla paliw, tony dla odpadów, km lub pasażerokilometry dla transportu. Warto ujednolicić zapis w osobnej kolumnie „jednostka”.
- **Jednostki emisji:** najczęściej tCO₂e; upewnij się, że nie są pomieszane kg CO₂e i tCO₂e.
- **Przeliczenia:** sprawdź, czy współczynniki emisji odpowiadają danemu paliwu, jednostce, rokowi i zastosowanemu GWP.
- **Przypisanie do sektorów:** dla każdego wiersza określ sektor, podsektor i źródło. Przykładowo:
  - zużycie energii w budynkach → energia stacjonarna,
  - paliwa pojazdów → transport,
  - składowanie/spalanie/przetwarzanie odpadów → odpady.
- **Zakres i granice:** zaznacz, czy dane dotyczą emisji na terenie miasta, energii zużytej przez mieszkańców czy działalności jednostek miejskich — to wpływa na właściwe ujęcie w inwentaryzacji.
- **Źródło i metodologia:** zachowaj link/nazwę instytucji, plik źródłowy, współczynnik emisji oraz krótką notatkę o obliczeniu.

Po przesłaniu pliku mogę przygotować krótką listę: które arkusze i kolumny są gotowe, gdzie występują braki oraz jak przypisać rekordy do sektorów.

Czas do końca odpowiedzi (wraz z UI): 11.6 s.

## Użytkownik 3

Co powinnam sprawdzić przed ostatecznym zatwierdzeniem?

## Clima 3

Przed ostatecznym zatwierdzeniem inwentaryzacji warto przejść przez tę krótką checklistę:

### 1. Granice i rok
- Potwierdź **rok inwentaryzacyjny** dla wszystkich danych.
- Sprawdź, czy dane dotyczą właściwego **obszaru miasta/gminy**.
- Upewnij się, że nie mieszasz emisji terytorialnych z emisjami organizacyjnymi urzędu lub spółek miejskich.
- Zapisz wszelkie wyjątki: dane szacunkowe, dane z innego roku, brakujące obszary.

### 2. Kompletność sektorów
Sprawdź, czy przeanalizowano co najmniej:
- **energię stacjonarną**: budynki mieszkalne, komercyjne/publiczne, przemysł oraz zużycie energii;
- **transport**: ruch drogowy, transport publiczny, a gdzie ma zastosowanie także kolej, żeglugę lub lotnictwo;
- **odpady**: składowanie, biologiczne przetwarzanie, spalanie oraz ścieki.

Brak danych nie musi oznaczać błędu, ale powinien być oznaczony i uzasadniony.

### 3. Jednostki i obliczenia
- Zweryfikuj jednostki danych aktywności: np. kWh/MWh, litry/m³, tony, km.
- Upewnij się, że emisje są w jednej jednostce, zwykle **tCO₂e**.
- Sprawdź przeliczniki: 1 MWh = 1 000 kWh; 1 t = 1 000 kg.
- Skontroluj, czy nie zastosowano współczynnika emisji dwa razy lub nie pomylono kg CO₂e z tCO₂e.
- Zweryfikuj, czy współczynniki emisji pasują do paliwa, technologii, jednostki i roku.

### 4. Przypisanie do kategorii
- Każdy rekord powinien mieć prawidłowy sektor, podsektor i źródło.
- Sprawdź, czy emisje z energii elektrycznej nie są jednocześnie przypisane do zużycia energii i do wytwarzania energii — unikaj **podwójnego liczenia**.
- Przejrzyj granice sektorów, np. paliwa zużywane w budynkach vs. paliwa w pojazdach.

### 5. Kontrola jakości i wiarygodności
- Porównaj wyniki z poprzednim rokiem lub podobnymi miastami. Duże zmiany powinny mieć wyjaśnienie.
- Sprawdź sektory o największym udziale oraz rekordy o nietypowo wysokich lub zerowych wartościach.
- Porównaj sumy arkuszy z sumami widocznymi w CityCatalyst.
- Upewnij się, że dane źródłowe, daty pozyskania i osoba odpowiedzialna są zapisane.

### 6. Metodologia i dokumentacja
- Udokumentuj źródła danych, założenia, współczynniki emisji i zastosowane wskaźniki GWP.
- Opisz sposób szacowania braków danych oraz stopień niepewności.
- Sprawdź zgodność metodologii między sektorami i — jeśli stosujesz standard miejski — z wymaganiami **GPC**.

### 7. Ostatnie zatwierdzenie
- Sprawdź, czy wszystkie wymagane pola w CityCatalyst są uzupełnione.
- Przejrzyj komunikaty walidacyjne i wyjaśnij lub popraw błędy.
- Zatwierdź dopiero po zapisaniu wersji źródłowego Excela oraz notatki metodologicznej.

Najczęstsze problemy przed zatwierdzeniem to: pomylone jednostki, niepełne dane transportowe, podwójne liczenie energii elektrycznej oraz brak opisu źródeł i założeń.

Czas do końca odpowiedzi (wraz z UI): 13.5 s.
