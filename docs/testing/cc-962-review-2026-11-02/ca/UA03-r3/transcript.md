# UA03-r3 — Posiadany arkusz Excel

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:53:33.382Z — 2026-11-01T10:54:14.018Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Mam naszą wcześniejszą inwentaryzację w Excelu i chciałabym wykorzystać ją w CityCatalyst. Jak mogę ją wprowadzić, żeby nie przepisywać wszystkiego ręcznie?

## Clima 1

Możesz uniknąć ręcznego przepisywania, przygotowując plik Excel do importu danych do inwentaryzacji.

1. **Utwórz lub otwórz właściwą inwentaryzację** w CityCatalyst — dla miasta i roku, którego dotyczy arkusz.  
2. **Sprawdź dostępny szablon importu** w sekcji danych/źródeł danych. Najbezpieczniej przenieść dane do struktury tego szablonu, zamiast importować dowolny układ istniejącego pliku.
3. W Excelu uporządkuj dane tak, aby dla każdej pozycji były jasne m.in.:
   - sektor i podsektor,
   - rok danych,
   - wartość aktywności lub zużycia,
   - jednostka,
   - źródło danych,
   - stosowany współczynnik emisji, jeśli jest już dostępny,
   - zakres emisji, jeśli został określony.
4. **Zaimportuj plik**, a następnie zweryfikuj mapowanie kolumn, jednostki i wyniki obliczeń. Szczególną uwagę zwróć na energię elektryczną, paliwa, odpady i transport — błędne jednostki mogą znacząco zmienić wynik.
5. Uzupełnij ręcznie tylko pola, których nie da się wiarygodnie przenieść z arkusza, np. metadane źródła, założenia lub brakujące podziały sektorowe.

Jeśli w Twojej wersji CityCatalyst nie ma opcji importu Excela dla danego modułu, warto użyć pliku jako materiału źródłowego i wprowadzać dane zbiorczo według sektorów, a nie rekord po rekordzie. Mogę też pomóc przełożyć układ Twojego arkusza na strukturę wymaganą do inwentaryzacji — opisz kolumny, które masz w Excelu.

Czas do końca odpowiedzi (wraz z UI): 10.9 s.

## Użytkownik 2

Czy mogę przesłać ten plik tutaj? Jak przed zatwierdzeniem sprawdzę rok, jednostki i przypisanie danych do sektorów?

## Clima 2

Tak — jeśli w tym czacie widzisz ikonę **załącznika** lub możliwość dodania pliku, możesz przesłać arkusz Excel tutaj. Mogę wtedy pomóc przejrzeć jego strukturę i wskazać, jak przygotować dane do wprowadzenia w CityCatalyst. Nie zatwierdzę ani nie zmienię Twojej inwentaryzacji bez Twojej wyraźnej decyzji.

Przed zatwierdzeniem warto wykonać kontrolę w trzech obszarach:

1. **Rok**
   - sprawdź, czy wszystkie dane dotyczą tego samego roku inwentaryzacyjnego;
   - rozdziel dane z różnych lat, np. rachunki za okres obejmujący dwa lata;
   - upewnij się, że rok w pliku odpowiada rokowi wybranej inwentaryzacji w CityCatalyst.

2. **Jednostki**
   - zweryfikuj jednostki przy każdej wartości: np. kWh/MWh energii, litry paliwa, tony odpadów, km lub pasażerokilometry w transporcie;
   - sprawdź przeliczniki, zwłaszcza MWh vs kWh, kg vs t oraz m³ vs litry;
   - nie mieszaj wartości aktywności z już obliczonymi emisjami CO₂e — powinny być wyraźnie oznaczone.

3. **Przypisanie do sektorów**
   - porównaj każdy wiersz z kategorią docelową w CityCatalyst, np. energia stacjonarna, transport, odpady, procesy przemysłowe i rolnictwo/użytkowanie gruntów — zależnie od zakresu inwentaryzacji;
   - sprawdź, czy energia elektryczna, paliwa i ciepło nie są podwójnie ujęte;
   - dla transportu rozróżnij dane o pojazdach miejskich, transporcie publicznym, ruchu na obszarze miasta oraz paliwach sprzedanych — właściwe przypisanie zależy od metodyki;
   - zachowaj przy każdym rekordzie informację o źródle i założeniach.

Po wgraniu najlepiej przejrzeć podgląd importu: mapowanie kolumn, rozpoznane jednostki, rok oraz sektor/podsektor dla każdego zestawu danych. Jeśli coś jest niejednoznaczne, popraw to przed zatwierdzeniem — nie zatwierdzaj automatycznie całego importu.

Czas do końca odpowiedzi (wraz z UI): 11.1 s.

## Użytkownik 3

Co powinnam sprawdzić przed ostatecznym zatwierdzeniem?

## Clima 3

Przed ostatecznym zatwierdzeniem zrób krótką kontrolę jakości:

- **Zakres i rok:** czy dane dotyczą właściwego miasta, granic administracyjnych i jednego roku inwentaryzacyjnego.
- **Kompletność sektorów:** czy uwzględniono wszystkie istotne sektory oraz czy brakujące dane są oznaczone jako brak, a nie jako zero.
- **Jednostki i przeliczniki:** np. kWh vs MWh, litry vs m³, kg vs t; sprawdź też współczynniki przeliczeniowe i współczynniki emisji.
- **Mapowanie do sektorów:** czy elektryczność, ciepło, paliwa, transport, odpady i emisje procesowe trafiły do właściwych kategorii.
- **Podwójne liczenie:** upewnij się, że ta sama energia lub paliwo nie występują w dwóch sektorach albo jednocześnie jako dane o zużyciu i jako gotowe emisje.
- **Wiarygodność wyników:** porównaj sumę emisji i największe sektory z poprzednim rokiem lub podobnym miastem. Duże odchylenia wyjaśnij i udokumentuj.
- **Granice i zakresy emisji:** sprawdź, czy zakresy emisji oraz emisje spoza obszaru miasta są traktowane zgodnie z przyjętą metodyką — szczególnie dla energii elektrycznej, transportu i odpadów.
- **Źródła danych:** czy przy każdym zestawie danych jest źródło, okres, właściciel danych oraz opis ewentualnych założeń lub estymacji.
- **Dane poufne i duplikaty:** usuń zbędne dane osobowe, sprawdź powtarzające się rekordy i wartości ujemne.
- **Kontrola techniczna:** przejrzyj komunikaty walidacyjne, pola nieuzupełnione oraz podgląd mapowania przed zatwierdzeniem.

Dobrym krokiem końcowym jest zapisanie listy wyjątków: co oszacowano, czego brakuje, jakie zastosowano przeliczniki i dlaczego. To ułatwia późniejszy audyt oraz aktualizację inwentaryzacji.

Czas do końca odpowiedzi (wraz z UI): 10.8 s.
