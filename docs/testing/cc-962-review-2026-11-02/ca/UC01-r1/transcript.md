# UC01-r1 — Gdzie znaleźć dane o energii dla miasta?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:10:08.285Z — 2026-11-01T11:11:16.662Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Uzupełniam inwentarz São Paulo za 2022 rok. Skąd mogę wziąć dane o energii stacjonarnej?

## Clima 1

Aby sprawdzić dostępne źródła danych dla energii stacjonarnej w tym inwentarzu, muszę najpierw uruchomić szkic sektora. Wtedy wyszukam podłączone zbiory danych i przygotuję propozycje do Twojej weryfikacji — bez zapisywania czegokolwiek do inwentarza.

Czy uruchomić wyszukiwanie źródeł?

Czas do końca odpowiedzi (wraz z UI): 8.8 s.

## Użytkownik 2

Tak, uruchom szkic do przeglądu i pokaż dostępne źródła. Na razie niczego nie zapisuj do inwentarza.

## Clima 2

[Brak odpowiedzi; HTTP 200; transport zakończony: true]

Czas do końca odpowiedzi (wraz z UI): 16.7 s.

## Użytkownik 3

Które z dostępnych źródeł mogą mi pomóc i jakich części sektora dotyczą?

## Clima 3

Dostępne i **mające zastosowanie** źródła dotyczą tych części energii stacjonarnej:

- **SEEG** — dane krajowe z 2015 r. dla emisji ze spalania paliw (**Scope 1**) w:
  - budynkach mieszkalnych,
  - budynkach komercyjnych i instytucjonalnych,
  - przemyśle i budownictwie,
  - sektorze energii — zużycie energii na potrzeby własne elektrowni,
  - rolnictwie, leśnictwie i rybołówstwie.

- **EPE (Empresa de Pesquisa Energética)** — dane krajowe z 2014 r. dla zużycia energii elektrycznej i powiązanych emisji:
  - **Scope 2:** budynki mieszkalne, komercyjne i instytucjonalne, przemysł i budownictwo oraz rolnictwo;
  - **Scope 3:** straty przesyłu i dystrybucji energii elektrycznej dla tych samych czterech grup.

- **Global Energy Monitor** — propozycja oznaczenia **NO** („nie występuje”) dla ulotnych emisji z wydobycia, przetwarzania, magazynowania i transportu węgla. Uzasadnienie źródła: nie wykryto takich instalacji w granicach miasta.

- **OGIM (Oil and Gas Infrastructure Mapping)** — analogiczna propozycja **NO** dla ulotnych emisji z systemów ropy i gazu, również z uzasadnieniem braku instalacji w granicach miasta.

Dla **Scope 2 i 3 sektora energii**, wytwarzania energii dostarczanej do sieci oraz wszystkich pozycji „źródła niesprecyzowane” nie znaleziono obecnie odpowiedniego źródła. Wszystkie propozycje są oparte na danych krajowych starszych niż rok inwentaryzacji 2022, więc warto uwzględnić to przy przeglądzie.

Czas do końca odpowiedzi (wraz z UI): 17.3 s.

## Użytkownik 4

Co powinnam teraz sprawdzić, zanim zdecyduję się użyć tych danych?

## Clima 4

Przed zaakceptowaniem propozycji sprawdź przede wszystkim:

1. **Dopasowanie roku i geografii**  
   Wszystkie dostępne dane są krajowe i starsze niż inwentarz 2022: SEEG pochodzi z 2015 r., a EPE z 2014 r. Oceń, czy możesz je zastosować jako przybliżenie dla São Paulo, czy masz nowsze dane miejskie lub od dostawców energii.

2. **Zakres i przypisanie do właściwego wiersza GPC**  
   - SEEG obejmuje spalanie paliw w **Scope 1**.  
   - EPE obejmuje energię elektryczną w **Scope 2** oraz straty przesyłu i dystrybucji w **Scope 3**.  
   Upewnij się, że nie przypisujesz tych samych emisji do więcej niż jednego sektora lub zakresu.

3. **Metodę i jednostki**  
   W panelu źródła sprawdź aktywność, jednostkę i emisje CO₂e. Dla propozycji EPE aktywność jest raportowana w MWh; propozycje SEEG dotyczą całkowitego zużycia paliw, lecz w dostępnych rekordach brak jednostki aktywności — występują za to emisje według gazów.

4. **Kompletność podsektorów**  
   Źródła pokrywają mieszkalnictwo, budynki komercyjne, przemysł, rolnictwo i część sektora energii. Nadal są luki m.in. dla energii elektrycznej i strat w sektorze energii oraz dla „źródeł niesprecyzowanych”.

5. **Oznaczenia „NO” dla emisji ulotnych**  
   Dla emisji z węgla oraz systemów ropy i gazu dostępne są propozycje **NO** („nie występuje”), oparte na braku wykrytych instalacji w granicach miasta. Potwierdź to lokalną wiedzą lub rejestrami infrastruktury, zanim ustawisz oznaczenie.

6. **Plausibility check**  
   Porównaj wielkości emisji z wcześniejszymi inwentarzami São Paulo, danymi o zużyciu energii oraz liczbą ludności. Duże odchylenia mogą wynikać z użycia danych krajowych zamiast miejskich.

Najbezpieczniej zacząć od przejrzenia każdego proponowanego wiersza w panelu po prawej, szczególnie danych krajowych SEEG i EPE, a następnie zaakceptować tylko te, które są metodologicznie uzasadnione.

Czas do końca odpowiedzi (wraz z UI): 12.2 s.
