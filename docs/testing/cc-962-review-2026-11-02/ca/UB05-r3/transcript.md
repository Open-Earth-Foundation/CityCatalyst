# UB05-r3 — Luki przed oddaniem inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:00:40.860Z — 2026-11-01T11:01:30.207Z.

[Nagranie](https://github.com/user-attachments/assets/dc70b5d3-12ea-4c6f-8540-703f151312c8) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Zanim przekażę przełożonej wyniki za 2024 rok, chciałabym sprawdzić kompletność naszej inwentaryzacji. Które obszary mają luki?

## Clima 1

Dla inwentaryzacji **2024** w Brzegu Nadziei kompletność wynosi obecnie **8%**: wypełniono **4 z 48** wymaganych pozycji, a **44** pozostają brakujące.

Luki według obszaru:
- **Energia stacjonarna (I):** 19 z 21 pozycji brakuje — kompletność 10%.
- **Transport (II):** 13 z 14 pozycji brakuje — kompletność 7%.
- **Odpady (III):** 7 z 8 pozycji brakuje — kompletność 13%.
- **Procesy przemysłowe i użytkowanie produktów (IPPU, IV):** brak wszystkich 2 wymaganych pozycji — 0%.
- **Rolnictwo, leśnictwo i użytkowanie gruntów (AFOLU, V):** brak wszystkich 3 wymaganych pozycji — 0%.

Największe luki ilościowo dotyczą energii stacjonarnej i transportu, a najbardziej niekompletne obszary to **IPPU i AFOLU**, gdzie nie wprowadzono jeszcze żadnych danych.

Czas do końca odpowiedzi (wraz z UI): 11.9 s.

## Użytkownik 2

A co z procesami przemysłowymi oraz rolnictwem i użytkowaniem gruntów? Czy brak wartości oznacza, że emisje są tam zerowe?

## Clima 2

Nie. **Brak wartości nie oznacza zerowych emisji.**

W inwentaryzacji za 2024 r.:
- **IPPU (procesy przemysłowe i użytkowanie produktów):** brak danych dla wszystkich **2 wymaganych pozycji**.
- **AFOLU (rolnictwo, leśnictwo i użytkowanie gruntów):** brak danych dla wszystkich **3 wymaganych pozycji**.

Żadna z tych pozycji nie została oznaczona jako „nie występuje” ani „nie oszacowano” — są po prostu niewypełnione. Dlatego nie należy interpretować ich jako zera ani pomijać w wynikach bez wyraźnego uzasadnienia.

Jeśli dana aktywność rzeczywiście nie występuje na terenie miasta, warto oznaczyć ją jako **„nie występuje”** i udokumentować podstawę. Jeśli występuje, ale brakuje danych, należy ją oznaczyć jako brak danych / nieoszacowaną, a nie jako zero.

Czas do końca odpowiedzi (wraz z UI): 8.7 s.

## Użytkownik 3

Jakie konkretne dane i źródła powinnam zebrać oraz gdzie w aplikacji sprawdzić lub uzupełnić te luki? Na razie niczego nie zmieniaj.

## Clima 3

Nic nie zmieniam. W inwentaryzacji 2024 luki dotyczą wszystkich pozycji w **IPPU (2/2)** i **AFOLU (3/3)**.

## 1. IPPU — procesy przemysłowe i użytkowanie produktów
Zbierz najpierw informację, czy na obszarze miasta występują zakłady lub procesy powodujące emisje procesowe, niezależne od zużycia paliw.

**Dane do zebrania**
- rodzaj działalności i instalacji: np. produkcja cementu/wapna, szkła, ceramiki, metali, chemikaliów, chłodnictwo i klimatyzacja;
- liczba/typ urządzeń chłodniczych lub klimatyzacyjnych oraz dane o serwisie, ubytkach i uzupełnieniu czynników chłodniczych (F-gazy), jeśli dotyczy;
- wielkość produkcji lub zużycie surowców dla procesów przemysłowych;
- informacje o zastosowanych gazach technicznych i chłodniczych;
- rok danych, jednostki, zasięg geograficzny, założenia i źródło każdej wartości.

**Potencjalne źródła**
- urząd miasta: ewidencja działalności gospodarczej, pozwolenia środowiskowe, zgłoszenia instalacji;
- lokalne zakłady przemysłowe i operatorzy dużych obiektów;
- wojewódzki/regionalny inspektorat ochrony środowiska lub krajowy rejestr emisji — tam, gdzie dane są publicznie dostępne;
- firmy serwisujące chłodnictwo i klimatyzację oraz zarządcy dużych budynków;
- statystyka publiczna i krajowa inwentaryzacja emisji, gdy dane lokalne nie są dostępne.

Jeżeli po sprawdzeniu potwierdzisz, że dane procesy **nie występują** w granicach miasta, oznacz pozycję jako „nie występuje” i zachowaj krótkie uzasadnienie. Jeśli występują, ale danych nie da się uzyskać, nie wpisuj zera — zaznacz brak danych / nieoszacowanie.

## 2. AFOLU — rolnictwo, leśnictwo i użytkowanie gruntów
W GPC trzy wymagane grupy AFOLU to:
1. **Hodowla zwierząt**
2. **Grunty** — w tym zmiany użytkowania gruntów, lasy, grunty uprawne, łąki, tereny podmokłe i zieleń/drzewa miejskie, jeśli są istotne
3. **Pozostałe źródła i emisje nie-CO₂ z gruntów** — np. nawożenie i gospodarowanie glebami, zależnie od lokalnej aktywności

**Dane do zebrania**
- pogłowie zwierząt według gatunku i systemu chowu;
- powierzchnie gruntów według kategorii użytkowania w 2024 r. oraz — jeśli to możliwe — zmiany względem wcześniejszych lat;
- dane o nawozach mineralnych i organicznych, uprawach oraz zarządzaniu glebami;
- informacje o lasach, terenach zieleni, zadrzewieniu i ewentualnych zmianach pokrycia terenu;
- dane o osuszanych/podmokłych terenach, jeśli występują.

**Potencjalne źródła**
- urząd miasta/gminy: planowanie przestrzenne, ewidencja gruntów i budynków, wydziały ochrony środowiska i zieleni;
- lokalne lub krajowe statystyki rolnicze i spis rolny;
- nadleśnictwa, zarządcy terenów zieleni, geodezja i rejestry pokrycia terenu;
- zdjęcia satelitarne lub mapy pokrycia terenu — jako wsparcie do weryfikacji powierzchni i zmian;
- ankiety do gospodarstw lub rolników, gdy brak danych administracyjnych.

Według **wewnętrznej bazy wiedzy klimatycznej**, GPC wymaga stosowania oznaczeń zarówno dla źródeł, które nie występują, jak i dla luk danych. Zaleca też preferowanie danych lokalnych i krajowych, możliwie zgodnych z rokiem inwentaryzacji i granicą miasta; gdy są niedostępne, można zastosować wartości domyślne IPCC wraz z udokumentowaniem założeń.

## Gdzie sprawdzić i uzupełnić w CityCatalyst
W inwentaryzacji **GHGI 2024** przejdź do widoku wprowadzania danych według sektorów i otwórz:
- **Sektor IV — IPPU**
- **Sektor V — AFOLU**

W każdej brakującej pozycji sprawdź, czy można ustawić stan danych:
- **wprowadzone / ręcznie dodane lub przesłane** — gdy masz dane i metodę obliczeń,
- **nie występuje** — tylko gdy aktywność została zweryfikowana jako nieobecna,
- **nie oszacowano / brak danych** — gdy źródło istnieje, ale nie masz wiarygodnej wartości.

Przy uzupełnianiu zapisz też źródło, rok, jednostkę, metodę przeliczenia i wszelkie założenia. Dzięki temu wynik będzie możliwy do obrony przed przekazaniem przełożonej.

Czas do końca odpowiedzi (wraz z UI): 22.4 s.
