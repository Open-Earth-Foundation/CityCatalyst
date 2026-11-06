# UA04-r2 — Raport w PDF jako źródło inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:54:21.478Z — 2026-11-01T10:55:02.195Z.

[Nagranie](https://github.com/user-attachments/assets/c563fe6d-4b64-4348-b84b-2515295fdc09) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam raport o emisjach naszego miasta w PDF. Czy da się na jego podstawie uzupełnić inwentaryzację w CityCatalyst? Nie wiem, od czego zacząć.

## Clima 1

Tak — raport PDF może być dobrym źródłem do uzupełnienia inwentaryzacji, o ile zawiera dane liczbowe oraz informacje o roku, granicach miasta i metodologii.

Proponowany sposób pracy w CityCatalyst:

1. **Ustal zakres raportu**
   Sprawdź rok inwentaryzacji, obszar geograficzny, użyty współczynnik GWP oraz metodę raportowania (np. GPC), jeśli została podana.

2. **Przygotuj dane z PDF**
   Wypisz lub przenieś do tabeli wartości według sektorów i paliw/źródeł, np.:
   - energia stacjonarna: budynki mieszkalne, komercyjne i instytucjonalne, przemysł;
   - transport: paliwa, zużycie energii lub emisje;
   - odpady: odpady stałe i ścieki;
   - ewentualnie rolnictwo, procesy przemysłowe i inne źródła.

3. **Zachowaj źródła i założenia**
   Dla każdej wartości zapisz stronę raportu, jednostkę, rok danych, źródło aktywności oraz współczynniki emisji. To ułatwia weryfikację i późniejszą aktualizację.

4. **Wprowadź dane sektorami w CityCatalyst**
   Najlepiej zacząć od sektorów z kompletnymi danymi, a brakujące pozycje oznaczać jako wymagające uzupełnienia — nie należy zastępować ich zgadywanymi wartościami.

5. **Sprawdź spójność wyniku**
   Porównaj sumę w CityCatalyst z całkowitą emisją podaną w raporcie. Różnice często wynikają z innego zakresu emisji, jednostek, roku bazowego albo współczynników emisji.

Jeśli prześlesz treść kluczowych tabel lub opiszesz, jakie sektory obejmuje PDF, pomogę rozpisać go na konkretne pola inwentaryzacji i wskazać, od którego sektora zacząć.

Czas do końca odpowiedzi (wraz z UI): 10.5 s.

## Użytkownik 2

Raportu jeszcze nigdzie nie przesłałam. Gdzie mam go wybrać i jak sprawdzić, czy liczby i rok zostały dobrze odczytane?

## Clima 2

Jeśli w Twojej wersji CityCatalyst jest dostępne dodawanie dokumentów, zacznij od widoku **inwentaryzacji emisji** i poszukaj opcji typu **„Dodaj źródło danych”**, **„Prześlij dokument”** lub ikony załącznika przy danym sektorze. Wybierz PDF, a następnie przypisz go do właściwego roku i obszaru tematycznego.

Po przesłaniu sprawdź przede wszystkim:

- **Rok danych** — czy dotyczy roku inwentaryzacji, a nie roku publikacji raportu.
- **Granice miasta** — czy raport obejmuje tę samą gminę/miasto co inwentaryzacja.
- **Jednostki** — np. tCO₂e, tCO₂, kg CO₂e, MWh, GJ; upewnij się, że wartości nie zostały przeliczone 1 000 razy za wysoko lub za nisko.
- **Zakres emisji** — czy chodzi o emisje bezpośrednie, pośrednie z energii, czy łączną wartość; nie sumuj pozycji, które już zawierają podsumowanie.
- **Sektory** — porównaj nazwy i wartości tabel z polami w CityCatalyst, np. budynki, transport, odpady.
- **Suma kontrolna** — zsumuj wprowadzone sektory i porównaj z całkowitą emisją podaną w raporcie. Niewielka różnica może wynikać z zaokrągleń; większa zwykle wymaga sprawdzenia zakresu lub jednostek.

Jeżeli nie widzisz opcji przesyłania PDF, możliwe, że w tym widoku dokumenty nie są importowane bezpośrednio. Wtedy użyj raportu jako materiału referencyjnego: otwórz go lokalnie i przepisz dane do odpowiednich sektorów, zapisując numer strony i tabeli jako źródło.

Czas do końca odpowiedzi (wraz z UI): 10.8 s.

## Użytkownik 3

A jeśli jakaś tabela zostanie źle odczytana albo zabraknie jednostek, czy mogę to sprawdzić przed zapisaniem?

## Clima 3

Tak — warto zweryfikować dane **przed zapisaniem**. Najbezpieczniej potraktować odczyt z PDF jako wersję roboczą i zatwierdzić go dopiero po kontroli.

Sprawdź kolejno:

- **Podgląd odczytanej tabeli:** czy kolumny i wiersze nie zostały przesunięte, a liczby dziesiętne są poprawne (np. `1,234` może oznaczać 1,234 albo 1 234 — zależnie od raportu).
- **Jednostkę przy tabeli i w przypisach:** szukaj jej w tytule, nagłówku kolumny, legendzie oraz przypisach pod tabelą. Jeśli jej nie ma, nie zakładaj automatycznie, że są to tCO₂e.
- **Rok danych:** potwierdź go w tytule tabeli lub w metodologii. Rok publikacji raportu nie musi być rokiem emisji.
- **Sumy kontrolne:** dodaj pozycje szczegółowe i porównaj z sumą sektora lub całego raportu. To szybko ujawnia pominięty wiersz, błędną jednostkę albo podwójne liczenie.
- **Rząd wielkości:** porównaj wynik z liczbą mieszkańców, zużyciem energii lub wynikiem z poprzedniego roku, jeśli są dostępne. Skok o 10× lub 1 000× zwykle oznacza błąd jednostki albo separatora.
- **Zakres danych:** sprawdź, czy tabela dotyczy tylko emisji bezpośrednich, tylko energii elektrycznej, czy sumy wszystkich kategorii. Nie wprowadzaj jednocześnie podsumowania i jego składowych jako osobnych danych.

Jeśli jednostki lub rok są niejasne, oznacz taki wpis jako **do wyjaśnienia** albo pozostaw go niezatwierdzony. Dopiero po znalezieniu potwierdzenia w metodologii, źródle danych lub u autora raportu warto go zapisać jako finalny.

Czas do końca odpowiedzi (wraz z UI): 11.4 s.
