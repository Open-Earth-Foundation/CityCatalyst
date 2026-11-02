# UA03-r2 — Posiadany arkusz Excel

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:52:49.476Z — 2026-11-01T10:53:32.260Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam naszą wcześniejszą inwentaryzację w Excelu i chciałabym wykorzystać ją w CityCatalyst. Jak mogę ją wprowadzić, żeby nie przepisywać wszystkiego ręcznie?

## Clima 1

Tak — najlepiej przygotować arkusz do importu, zamiast przepisywać dane ręcznie. Ogólny proces w CityCatalyst wygląda tak:

1. **Utwórz lub otwórz inwentaryzację** dla właściwego miasta i roku bazowego.  
2. Przejdź do odpowiedniego sektora emisji (np. energia stacjonarna, transport, odpady) i wybierz opcję **dodania/importu danych**, jeśli jest dostępna.  
3. **Dopasuj kolumny z Excela** do wymaganych pól CityCatalyst — zwykle są to m.in. rok, sektor/podsektor, aktywność (np. zużycie paliwa lub energii), jednostka, współczynnik emisji oraz źródło danych.  
4. Jeśli platforma udostępnia **szablon importu**, pobierz go i przenieś dane z dotychczasowego pliku do tego układu. To najbezpieczniejszy sposób, by uniknąć błędów jednostek i klasyfikacji.  
5. Po imporcie sprawdź wartości, przypisanie do sektorów, lata danych i zastosowane współczynniki emisji. Następnie uzupełnij źródła oraz założenia dla audytowalności.

Przed importem warto też:
- zachować surowe dane w osobnym arkuszu,
- ujednolicić jednostki (np. kWh, MWh, GJ, litry, tony),
- rozdzielić dane według sektora i nośnika energii/paliwa,
- oznaczyć brakujące dane i szacunki,
- sprawdzić, czy wcześniejsza inwentaryzacja używała tego samego roku i metodyki (np. GPC).

Jeśli w Twojej wersji CityCatalyst nie ma importu dla danego sektora, dane można zwykle wprowadzać zbiorczo według kategorii, wykorzystując Excel jako plik roboczy i kopiując tylko wartości zagregowane.

Czas do końca odpowiedzi (wraz z UI): 12.0 s.

## Użytkownik 2

Czy mogę przesłać ten plik tutaj? Jak przed zatwierdzeniem sprawdzę rok, jednostki i przypisanie danych do sektorów?

## Clima 2

Jeśli w tym czacie widzisz ikonę załącznika lub opcję dodania pliku, możesz przesłać Excel tutaj. Mogę wtedy pomóc przejrzeć jego strukturę: arkusze, lata, jednostki, kolumny oraz zaproponować przypisanie do sektorów przed wprowadzeniem danych do CityCatalyst.

Przed zatwierdzeniem warto przejść przez krótką kontrolę:

- **Rok inwentaryzacji:** sprawdź, czy każdy rekord dotyczy wybranego roku bazowego lub czy lata są jasno oznaczone. Nie łącz danych z różnych lat bez oznaczenia.
- **Jednostki:** upewnij się, że przy każdej wartości aktywności jest jednostka, np. kWh/MWh energii elektrycznej, GJ gazu, litry paliwa, tony odpadów. Szczególnie sprawdź przeliczniki tys./mln oraz kWh vs MWh.
- **Sektory i podsektory:** przypisz dane do właściwych obszarów, np.:
  - energia w budynkach i obiektach,
  - transport drogowy lub pozadrogowy,
  - odpady stałe i ścieki,
  - procesy przemysłowe lub rolnictwo — jeśli są objęte zakresem.
- **Typ danych:** rozdziel dane aktywności (np. zużycie paliwa) od już wyliczonych emisji CO₂e. To ważne, aby nie liczyć tych samych emisji podwójnie.
- **Zakres i granice:** sprawdź, czy dane dotyczą całego obszaru miasta oraz czy nie obejmują emisji spoza jego granic.
- **Źródła i założenia:** zachowaj nazwę źródła, okres danych, użyte współczynniki emisji oraz opis wszelkich szacunków.

Najlepiej nie zatwierdzać importu od razu: najpierw porównaj podsumowania sektorowe z wcześniejszym Excelem i sprawdź, czy wartości nie wzrosły/spadły wyłącznie przez zmianę jednostek albo klasyfikacji.

Czas do końca odpowiedzi (wraz z UI): 11.1 s.

## Użytkownik 3

Co powinnam sprawdzić przed ostatecznym zatwierdzeniem?

## Clima 3

Przed ostatecznym zatwierdzeniem zrób krótką kontrolę jakości:

1. **Właściwy rok i granice miasta**
   - Czy wszystkie dane dotyczą wybranego roku inwentaryzacji?
   - Czy obejmują właściwy obszar administracyjny miasta, a nie np. cały powiat, region lub obszar obsługiwany przez dostawcę mediów?

2. **Kompletność sektorów**
   - Czy uwzględniono wszystkie istotne sektory: budynki/energia, transport, odpady oraz — jeśli mają zastosowanie — procesy przemysłowe i rolnictwo?
   - Czy puste sektory są rzeczywiście zerowe, czy po prostu brakuje dla nich danych?

3. **Jednostki i przeliczenia**
   - Czy jednostki są zgodne z danymi źródłowymi: kWh vs MWh, GJ vs MJ, litry vs m³, kg vs t?
   - Czy wartości nie zostały przeliczone podwójnie?
   - Czy odróżniono dane aktywności od emisji już wyrażonych w tCO₂e?

4. **Przypisanie do sektorów**
   - Czy energia w budynkach, transport, odpady i inne źródła trafiły do właściwych sektorów i podsektorów?
   - Czy nie ma podwójnego liczenia, np. zużycia paliw i odpowiadających mu wcześniej obliczonych emisji w dwóch różnych miejscach?

5. **Współczynniki emisji i GWP**
   - Czy współczynniki emisji odpowiadają danemu rokowi, paliwu oraz lokalizacji?
   - Czy w całej inwentaryzacji zastosowano spójny zestaw wartości GWP (potencjału tworzenia efektu cieplarnianego)?
   - Czy wiadomo, czy energia elektryczna jest liczona według właściwego miksu sieciowego?

6. **Porównanie z wcześniejszą inwentaryzacją**
   - Czy całkowite emisje i wyniki sektorowe są wiarygodne w porównaniu z poprzednim Excelem?
   - Dla większych zmian przygotuj krótkie wyjaśnienie: zmiana granic, metodologii, aktywności, współczynników albo jakości danych.

7. **Źródła, założenia i ścieżka audytu**
   - Czy przy danych zapisano źródło, okres, właściciela danych i metodę pozyskania?
   - Czy udokumentowano szacunki, ekstrapolacje, brakujące dane i ręczne korekty?
   - Czy można odtworzyć obliczenia z danych wejściowych?

8. **Kontrole logiczne**
   - Czy nie ma wartości ujemnych, nieoczekiwanych zer lub skoków o rząd wielkości?
   - Czy sumy podsektorów zgadzają się z sumami sektorów?
   - Czy udziały sektorów wyglądają realistycznie dla miasta?

Na końcu warto zatwierdzić dopiero po sprawdzeniu podsumowania całkowitych emisji, największych sektorów oraz listy brakujących danych. Jeśli prześlesz plik, mogę pomóc przygotować listę konkretnych kontroli dla jego arkuszy i kolumn.

Czas do końca odpowiedzi (wraz z UI): 12.4 s.
