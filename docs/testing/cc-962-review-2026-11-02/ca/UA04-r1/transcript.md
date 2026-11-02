# UA04-r1 — Raport w PDF jako źródło inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:53:40.441Z — 2026-11-01T10:54:23.092Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam raport o emisjach naszego miasta w PDF. Czy da się na jego podstawie uzupełnić inwentaryzację w CityCatalyst? Nie wiem, od czego zacząć.

## Clima 1

Tak — raport PDF może być dobrym punktem wyjścia do uzupełnienia inwentaryzacji, o ile zawiera dane źródłowe, rok inwentaryzacji oraz opis metodyki.

**Proponowany sposób pracy w CityCatalyst:**
1. **Ustal zakres raportu**: rok bazowy, granice miasta (administracyjne czy funkcjonalne), gazy uwzględnione w raporcie i stosowany współczynnik GWP.
2. **Sprawdź metodykę**: najlepiej, jeśli raport odnosi się do GPC (Global Protocol for Community-Scale GHG Emission Inventories) lub jasno opisuje zakresy emisji i źródła danych.
3. **Wyodrębnij dane według sektorów**: zwykle energia stacjonarna/budynki, transport, odpady oraz — jeśli dostępne — emisje przemysłowe, rolnictwo i AFOLU.
4. **Wprowadź dane do odpowiednich sektorów CityCatalyst**: nie tylko łączną wartość emisji, ale także aktywności i wskaźniki źródłowe, jeśli raport je podaje (np. zużycie energii, paliw, odpady, przebiegi pojazdów).
5. **Dodaj źródła i założenia**: zanotuj nazwę raportu, stronę/tabelę, instytucję publikującą, rok danych, współczynniki emisji i wszelkie ograniczenia. To ułatwia późniejszą weryfikację.
6. **Porównaj wynik końcowy z raportem**: po uzupełnieniu sektorów sprawdź, czy suma oraz podział sektorowy są zgodne. Różnice mogą wynikać np. z innego GWP, granic miasta lub przypisania emisji do zakresów.

**Od czego zacząć praktycznie:** znajdź w PDF tabelę z całkowitymi emisjami i rozbiciem na sektory, a następnie tabelę lub aneks opisujący źródła danych oraz metodę obliczeń. To zwykle wystarcza, aby zaplanować pierwsze wpisy.

Jeśli prześlesz PDF albo wkleisz spis treści i tabelę emisji, pomogę zmapować dane z raportu na pola i sektory inwentaryzacji CityCatalyst.

Czas do końca odpowiedzi (wraz z UI): 12.4 s.

## Użytkownik 2

Raportu jeszcze nigdzie nie przesłałam. Gdzie mam go wybrać i jak sprawdzić, czy liczby i rok zostały dobrze odczytane?

## Clima 2

Masz dostęp do jednej inwentaryzacji: **Brzeg Nadziei (test), 2024** — „GHGI 2024” (GPC Basic+; współczynniki GWP AR6).

Aby przesłać raport:
1. Otwórz tę inwentaryzację w CityCatalyst.
2. Przejdź do sekcji **źródeł danych / danych aktywności** dla sektora, którego dotyczy raport, lub do funkcji importu dokumentu, jeśli jest dostępna w Twoim widoku.
3. Wybierz **Dodaj źródło / Prześlij plik** i wskaż PDF z dysku.
4. Po przetworzeniu dokumentu sprawdź podgląd wyodrębnionych danych przed ich zapisaniem.

Przy weryfikacji zwróć uwagę przede wszystkim na:
- **rok danych** — powinien odpowiadać 2024 albo być świadomie przypisany jako dane historyczne;
- **jednostki** — np. tCO₂e, MWh, GJ, litry, tony odpadów;
- **sektor i zakres emisji** — czy wartości trafiły np. do budynków, transportu lub odpadów;
- **sumy kontrolne** — porównaj sumę sektorów w CityCatalyst z tabelą zbiorczą w PDF;
- **metodykę i GWP** — raport wykorzystujący inne współczynniki niż AR6 może dawać nieco inne wartości CO₂e.

Jeżeli po przesłaniu zobaczysz ekran z odczytanymi liczbami, wklej jego treść lub prześlij zrzut ekranu — pomogę sprawdzić rok, jednostki i przypisanie do sektorów.

Czas do końca odpowiedzi (wraz z UI): 11.5 s.

## Użytkownik 3

A jeśli jakaś tabela zostanie źle odczytana albo zabraknie jednostek, czy mogę to sprawdzić przed zapisaniem?

## Clima 3

Tak — przed zapisaniem warto przejść przez **podgląd i weryfikację** odczytanych danych. Sprawdź zwłaszcza każdą tabelę, w której PDF ma złożony układ, przypisy albo wartości w kilku kolumnach.

Lista kontroli przed zapisem:

- **Wartość i jednostka**: np. czy `1 250` oznacza tCO₂e, MWh, GJ, litry czy tony odpadów. Nie zapisuj wartości bez jednoznacznej jednostki.
- **Rok danych**: odróżnij rok publikacji raportu od roku, którego dotyczą dane. Raport z 2025 r. może opisywać emisje za 2024 r.
- **Nagłówki kolumn i wierszy**: upewnij się, że liczba została przypisana do właściwego sektora, nośnika energii lub gazu.
- **Zakres i granice**: sprawdź, czy tabela dotyczy całego miasta, tylko jednostek miejskich, czy np. wyłącznie budynków publicznych.
- **Suma kontrolna**: zsumuj pozycje i porównaj z sumą podaną w raporcie. Różnica często wskazuje na pominięty wiersz, błędny separator dziesiętny lub złe przypisanie kolumny.
- **Źródło w PDF**: zachowaj numer strony, nazwę tabeli i przypisy. Ułatwi to późniejszą korektę i audyt danych.

Jeśli odczyt nie rozpoznał jednostki, najlepiej **uzupełnić ją ręcznie na podstawie nagłówka tabeli lub przypisu**, a gdy w raporcie jej nie ma — nie zakładać jej automatycznie. Wtedy warto sprawdzić metodykę lub dane źródłowe autora raportu.

Jeżeli w ekranie importu nie ma etapu podglądu/edycji, potraktuj automatyczny odczyt jako szkic: porównaj wpisy z PDF przed zatwierdzeniem. Możesz też wkleić tutaj tabelę albo przesłać zrzut jej fragmentu — pomogę sprawdzić interpretację wartości, roku i jednostek.

Czas do końca odpowiedzi (wraz z UI): 11.4 s.
