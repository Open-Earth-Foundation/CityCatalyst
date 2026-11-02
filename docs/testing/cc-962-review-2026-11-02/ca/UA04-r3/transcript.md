# UA04-r3 — Raport w PDF jako źródło inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:54:30.206Z — 2026-11-01T10:55:11.858Z.

[Nagranie](https://github.com/user-attachments/assets/dc780ecc-d2ac-4f1a-a2cd-df638d5000cf) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam raport o emisjach naszego miasta w PDF. Czy da się na jego podstawie uzupełnić inwentaryzację w CityCatalyst? Nie wiem, od czego zacząć.

## Clima 1

Tak — raport PDF może być dobrym punktem wyjścia do uzupełnienia inwentaryzacji, o ile zawiera dane źródłowe i jasną metodykę, a nie tylko wykresy lub podsumowania.

Proponowany sposób pracy w CityCatalyst:

1. **Sprawdź zakres raportu**
   - rok inwentaryzacji,
   - granice miasta (administracyjne czy obszar funkcjonalny),
   - gazy i współczynniki GWP,
   - metodykę, np. GPC,
   - czy emisje są podane w tCO₂e.

2. **Wyodrębnij dane według sektorów**
   Najczęściej potrzebne będą dane dla:
   - energii stacjonarnej: budynki mieszkalne, komercyjne/instytucjonalne, przemysł;
   - transportu: paliwa, ruch drogowy, transport publiczny;
   - odpadów: składowanie, ścieki, spalanie;
   - ewentualnie IPPU i rolnictwa, leśnictwa oraz użytkowania gruntów.

3. **Zacznij od danych aktywności, nie tylko od sum emisji**
   Jeśli raport podaje np. zużycie energii w MWh, paliwa w litrach lub tonach, liczbę odpadów w tonach oraz użyte wskaźniki emisji, te dane zwykle najlepiej wprowadzać do odpowiednich modułów CityCatalyst. System może wtedy zachować przejrzysty ślad obliczeń.

4. **Wprowadź źródła i założenia**
   Przy każdej pozycji zanotuj źródło (raport, tabela/strona), rok, jednostkę, metodę oraz ważne założenia. To ułatwi późniejszą weryfikację i aktualizację.

5. **Porównaj wynik końcowy**
   Po uzupełnieniu sektorów porównaj całkowite emisje i udziały sektorów z raportem. Różnice mogą wynikać np. z innych współczynników emisji, granic inwentaryzacji albo sposobu przypisania emisji.

Najlepiej zacząć od tabeli z emisjami według sektorów oraz rozdziału o metodyce. Jeśli możesz wkleić tu spis treści, tabelę sektorową albo fragment metodyki z PDF, pomogę wskazać, które wartości gdzie wprowadzić i czego może brakować.

Czas do końca odpowiedzi (wraz z UI): 13.3 s.

## Użytkownik 2

Raportu jeszcze nigdzie nie przesłałam. Gdzie mam go wybrać i jak sprawdzić, czy liczby i rok zostały dobrze odczytane?

## Clima 2

Jeśli raport nie został jeszcze przesłany, zacznij od ekranu swojej inwentaryzacji w CityCatalyst:

1. **Otwórz właściwą inwentaryzację miasta i roku.**
2. Przejdź do sekcji związanej z **danymi źródłowymi / źródłami danych** albo wybierz sektor, który chcesz uzupełnić.
3. Poszukaj przycisku typu **„Dodaj źródło danych”**, **„Prześlij plik”** lub ikony załącznika i wybierz PDF z komputera.
4. Po przesłaniu sprawdź, czy system pokazuje:
   - nazwę pliku,
   - rozpoznany **rok danych/inwentaryzacji**,
   - miasto lub obszar objęty raportem,
   - strony/tabele wykorzystane do odczytu,
   - wartości, jednostki i przypisany sektor.

Przed zatwierdzeniem porównaj odczyt z PDF, zwłaszcza:
- **rok** — czy dotyczy roku emisji, a nie roku publikacji raportu;
- **jednostki** — np. tCO₂e, tCO₂, MWh, GJ, litry, tony;
- **zakres** — emisje całego miasta, a nie tylko obiektów miejskich;
- **sektor** — np. budynki, transport, odpady;
- **łączną emisję** i sumy sektorowe — czy zgadzają się z tabelami w raporcie.

Jeśli odczyt systemu nie odpowiada raportowi, nie zatwierdzaj go automatycznie: popraw rok, jednostkę lub przypisanie sektora ręcznie, a jako źródło zachowaj numer strony/tabeli z PDF.

Nazwy przycisków mogą się nieznacznie różnić zależnie od widoku i uprawnień. Jeśli opiszesz, co widzisz po wejściu do inwentaryzacji — albo wkleisz zrzut ekranu bez danych wrażliwych — wskażę następny krok.

Czas do końca odpowiedzi (wraz z UI): 11.2 s.

## Użytkownik 3

A jeśli jakaś tabela zostanie źle odczytana albo zabraknie jednostek, czy mogę to sprawdzić przed zapisaniem?

## Clima 3

Tak — warto to sprawdzić **przed zapisaniem lub zatwierdzeniem** danych.

Przy każdej odczytanej tabeli zweryfikuj:

- **rok danych** — czy to rok emisji, nie rok publikacji raportu;
- **nagłówki wierszy i kolumn** — sektor, paliwo, rodzaj odpadu, zakres emisji itp.;
- **wartości liczbowe** — porównaj kilka pozycji z oryginalnym PDF;
- **jednostkę** — np. tCO₂e, tCO₂, MWh, GJ, m³, litry lub tony;
- **skalę liczby** — czy „tys.”, „mln” albo przecinki/kropki dziesiętne zostały poprawnie rozpoznane;
- **sumy kontrolne** — czy suma pozycji zgadza się z sumą wiersza/kolumny w raporcie;
- **stronę i tabelę źródłową** — zachowaj odniesienie, aby móc wrócić do oryginału.

Jeśli jednostka nie została odczytana, **nie zgaduj**. Sprawdź legendę tabeli, przypisy, nagłówek rozdziału lub metodykę raportu. Gdy nadal jej brakuje, oznacz dane jako wymagające wyjaśnienia i nie używaj ich do końcowego wyniku inwentaryzacji.

Dobrą praktyką jest najpierw zapisać dane jako robocze, przejrzeć podgląd oraz dopiero potem zatwierdzić. Jeśli CityCatalyst pokazuje podgląd importu, skoryguj wartości, jednostki i przypisanie do sektora właśnie na tym etapie.

Czas do końca odpowiedzi (wraz z UI): 9.9 s.
