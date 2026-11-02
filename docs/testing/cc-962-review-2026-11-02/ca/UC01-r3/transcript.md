# UC01-r3 — Gdzie znaleźć dane o energii dla miasta?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:11:24.417Z — 2026-11-01T11:12:23.740Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Uzupełniam inwentarz São Paulo za 2022 rok. Skąd mogę wziąć dane o energii stacjonarnej?

## Clima 1

Aby zobaczyć dostępne dla tego inwentarza źródła danych i propozycje dla energii stacjonarnej, trzeba najpierw uruchomić szkic sektora. Mogę go przygotować — system przeszuka podłączone zbiory danych i pokaże wartości do weryfikacji przed zapisem. Czy uruchomić szkic?

Czas do końca odpowiedzi (wraz z UI): 7.3 s.

## Użytkownik 2

Tak, uruchom szkic do przeglądu i pokaż dostępne źródła. Na razie niczego nie zapisuj do inwentarza.

## Clima 2

Uruchomiłem przygotowanie szkicu. Gdy będzie gotowy, propozycje i dostępne źródła pojawią się w panelu przeglądu; nic nie zostanie zapisane do inwentarza.

Czas do końca odpowiedzi (wraz z UI): 15.5 s.

## Użytkownik 3

Które z dostępnych źródeł mogą mi pomóc i jakich części sektora dotyczą?

## Clima 3

Dostępne i **mające zastosowanie** źródła obejmują głównie dane krajowe, więc warto traktować je jako punkt wyjścia do przeglądu dla São Paulo 2022:

- **SEEG (2015, poziom kraju)** — emisje ze spalania paliw w **zakresie 1** dla:
  - budynków mieszkalnych,
  - budynków komercyjnych i instytucjonalnych,
  - przemysłu i budownictwa,
  - przemysłów energetycznych (zużycie energii pomocniczej elektrowni),
  - rolnictwa, leśnictwa i rybołówstwa.

- **EPE — Empresa de Pesquisa Energética (2014, poziom kraju)** — zużycie energii elektrycznej oraz powiązane emisje dla:
  - **zakresu 2**: budynki mieszkalne, komercyjne i instytucjonalne, przemysł i budownictwo oraz rolnictwo;
  - **zakresu 3**: straty przesyłu i dystrybucji energii elektrycznej dla tych samych czterech grup.

- **Global Energy Monitor (2019, poziom kraju)** — wskazuje oznaczenie **NO** („nie występuje”) dla emisji ulotnych z wydobycia, przetwarzania, magazynowania i transportu węgla: w granicach miasta nie wykryto takich instalacji.

- **OGIM — Oil and Gas Infrastructure Mapping (2019, poziom kraju)** — wskazuje **NO** dla emisji ulotnych z systemów ropy i gazu: nie wykryto instalacji w granicach miasta.

Dla części wierszy nie znaleziono odpowiedniego źródła: zakresów 2 i 3 dla pomocniczego zużycia energii w elektrowniach, produkcji energii dostarczanej do sieci oraz kategorii „źródła nieokreślone”.

Czas do końca odpowiedzi (wraz z UI): 13.0 s.

## Użytkownik 4

Co powinnam teraz sprawdzić, zanim zdecyduję się użyć tych danych?

## Clima 4

Przed zaakceptowaniem propozycji sprawdź przede wszystkim:

1. **Dopasowanie roku i geografii**  
   Inwentarz dotyczy São Paulo w **2022 r.**, natomiast dostępne dane są krajowe i starsze: SEEG z 2015 r. oraz EPE z 2014 r. Oceń, czy są wystarczające jako przybliżenie, czy masz nowsze dane miejskie/regionalne.

2. **Właściwy zakres i podsektor**  
   Upewnij się, że źródło trafia do właściwego wiersza GPC:
   - SEEG: spalanie paliw w zakresie 1,
   - EPE: zużycie energii z sieci w zakresie 2 oraz straty przesyłu i dystrybucji w zakresie 3.

3. **Wartości aktywności i emisji**  
   Sprawdź jednostki, zużycie paliw lub energii elektrycznej oraz emisje CO₂e. Dla wierszy SEEG propozycje zawierają emisje gazów, ale nie zawsze ilość zużytego paliwa; EPE zawiera zużycie energii elektrycznej w MWh i powiązane emisje.

4. **Czynniki emisji i metodykę**  
   Dla propozycji EPE czynnik emisji energii elektrycznej jest powiązany z BRGOV; dla strat przesyłu i dystrybucji wskazano World Bank. Sprawdź, czy odpowiadają one metodyce i GWP używanym w inwentarzu (AR5).

5. **Kompletność i możliwe podwójne liczenie**  
   Sprawdź, czy kategorie nie nakładają się na inne dane w inwentarzu i czy rozdział między zakresami 1, 2 i 3 jest zachowany.

6. **Oznaczenia „NO” dla emisji ulotnych**  
   Global Energy Monitor i OGIM wskazują brak odpowiednich instalacji w granicach miasta. Zweryfikuj to z lokalnymi rejestrami, zanim ustawisz „NO”.

7. **Braki danych**  
   Nadal nie ma źródeł dla części energetyki oraz kategorii „źródła nieokreślone”. Zdecyduj, czy pozostawić je puste, czy oznaczyć właściwym kluczem notacyjnym po potwierdzeniu zakresu.

Czas do końca odpowiedzi (wraz z UI): 10.6 s.
