# UC01-r2 — Gdzie znaleźć dane o energii dla miasta?

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:10:08.283Z — 2026-11-01T11:11:26.603Z.

[Nagranie](https://github.com/user-attachments/assets/a2e4571d-20ba-48a9-91e2-fe9386db33ab) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Uzupełniam inwentarz São Paulo za 2022 rok. Skąd mogę wziąć dane o energii stacjonarnej?

## Clima 1

Dane dla energii stacjonarnej zwykle pochodzą od operatorów energii elektrycznej i gazu, dostawców paliw, rejestrów budynków oraz miejskich lub krajowych statystyk zużycia energii.

W CityCatalyst mogę przeszukać źródła danych podłączone do tego inwentarza i przygotować propozycje dla pustych wierszy — każdą wartość zobaczysz do weryfikacji przed zapisem. Czy mam rozpocząć przygotowanie propozycji?

Czas do końca odpowiedzi (wraz z UI): 10.4 s.

## Użytkownik 2

Tak, uruchom szkic do przeglądu i pokaż dostępne źródła. Na razie niczego nie zapisuj do inwentarza.

## Clima 2

Wyszukuję podłączone źródła i przygotowuję propozycje do przeglądu. Po zakończeniu pokażę dostępne źródła; nic nie zostanie zapisane do inwentarza.

Czas do końca odpowiedzi (wraz z UI): 29.1 s.

## Użytkownik 3

Które z dostępnych źródeł mogą mi pomóc i jakich części sektora dotyczą?

## Clima 3

Dla tego szkicu dostępne są przede wszystkim trzy użyteczne źródła — wszystkie mają dopasowanie na poziomie kraju, a nie bezpośrednio miasta, i dotyczą lat wcześniejszych niż inwentarz 2022:

- **SEEG (2015)** — emisje ze spalania paliw w **Zakresie 1**:
  - budynki mieszkalne,
  - budynki i obiekty komercyjne/instytucjonalne,
  - przemysł i budownictwo,
  - przemysły energetyczne – zużycie energii na potrzeby własne elektrowni,
  - rolnictwo, leśnictwo i rybołówstwo.

- **EPE – Empresa de Pesquisa Energética (2014)** — zużycie energii elektrycznej oraz emisje dla:
  - **Zakresu 2**: budynki mieszkalne, komercyjne/instytucjonalne, przemysł i budownictwo oraz rolnictwo;
  - **Zakresu 3**: straty przesyłowe i dystrybucyjne energii elektrycznej dla tych samych grup.

- **Global Energy Monitor (2019)** — wiersz dotyczący emisji ulotnych z wydobycia, przetwarzania, magazynowania i transportu węgla. Źródło wskazuje **NO** („nie występuje”), ponieważ nie znaleziono instalacji w granicach miasta.

Dodatkowo **OGIM (2019)** wskazuje **NO** dla emisji ulotnych z systemów ropy i gazu — również z uzasadnieniem, że w granicach miasta nie znaleziono instalacji.

Brakuje natomiast źródeł dla m.in. energii elektrycznej zużywanej na potrzeby własne przemysłów energetycznych, jej strat przesyłowych, energii wytwarzanej i dostarczanej do sieci oraz pozycji „nieokreślone źródła”.

Czas do końca odpowiedzi (wraz z UI): 13.3 s.

## Użytkownik 4

Co powinnam teraz sprawdzić, zanim zdecyduję się użyć tych danych?

## Clima 4

Przed wyborem danych sprawdź przede wszystkim:

1. **Dopasowanie roku i geograficzne**
   Propozycje dotyczą danych krajowych z lat **2014–2019**, podczas gdy inwentarz jest za **2022 r.** Nie są to dane bezpośrednio dla São Paulo, więc warto ocenić, czy akceptujesz tę lukę czasową i skalę krajową.

2. **Zakres i klasyfikację GPC**
   Upewnij się, że źródło trafia do właściwego wiersza:
   - SEEG: spalanie paliw na miejscu — **Zakres 1**;
   - EPE: zakupiona energia elektryczna — **Zakres 2**;
   - EPE: straty przesyłu i dystrybucji energii — **Zakres 3**.

3. **Wartości aktywności i emisji**
   Dla danych EPE można porównać zużycie energii elektrycznej w MWh oraz wynikające z niego emisje. Dla propozycji SEEG dostępne są przede wszystkim emisje gazów, bez wartości zużycia paliwa — sprawdź, czy to wystarcza dla Twojej dokumentacji.

4. **Czynniki emisji i GWP**
   EPE używa czynnika emisji powiązanego z BRGOV dla energii elektrycznej; propozycje są przeliczone do CO₂e w horyzoncie 100-letnim. Sprawdź zgodność z przyjętym przez inwentarz **AR5**.

5. **Ryzyko podwójnego liczenia**
   Zweryfikuj, czy emisje paliw ze źródeł SEEG nie pokrywają się z danymi, które planujesz dodać z lokalnych dostawców paliw, gazu lub energii.

6. **Wiersze oznaczone „NO”**
   Dla emisji ulotnych z węgla oraz ropy i gazu źródła wskazują brak instalacji w granicach miasta. Potwierdź to lokalną wiedzą przed zastosowaniem oznaczenia „nie występuje”.

Po tej kontroli możesz zaakceptować pojedynczą propozycję albo poprosić o zastosowanie rekomendacji dla kilku wierszy — przed takim zbiorczym działaniem pokażę potwierdzenie.

Czas do końca odpowiedzi (wraz z UI): 11.7 s.
