# UB05-r1 — Luki przed oddaniem inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:59:42.193Z — 2026-11-01T11:00:33.861Z.

[Nagranie](https://github.com/user-attachments/assets/4070f8e5-98d7-4fc4-a0a2-f9e829778999) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Zanim przekażę przełożonej wyniki za 2024 rok, chciałabym sprawdzić kompletność naszej inwentaryzacji. Które obszary mają luki?

## Clima 1

Dla inwentaryzacji **Brzeg Nadziei (test), 2024** kompletność wynosi obecnie **8%**: wypełniono **4 z 48** wymaganych pozycji, a **44 pozostają brakujące**.

Luki według obszaru:
- **Energia stacjonarna (I):** brakuje 19 z 21 pozycji — kompletność 10%.
- **Transport (II):** brakuje 13 z 14 pozycji — kompletność 7%.
- **Odpady (III):** brakuje 7 z 8 pozycji — kompletność 13%.
- **Procesy przemysłowe i użytkowanie produktów — IPPU (IV):** brakuje wszystkich 2 pozycji — kompletność 0%.
- **Rolnictwo, leśnictwo i użytkowanie gruntów — AFOLU (V):** brakuje wszystkich 3 pozycji — kompletność 0%.

Wszystkie obecnie wypełnione pozycje pochodzą z danych wprowadzonych ręcznie lub przesłanych; nie ma jeszcze danych zewnętrznych. Przed przekazaniem wyników warto w pierwszej kolejności uzupełnić **IPPU i AFOLU**, a następnie największe braki w energii stacjonarnej i transporcie.

Czas do końca odpowiedzi (wraz z UI): 12.8 s.

## Użytkownik 2

A co z procesami przemysłowymi oraz rolnictwem i użytkowaniem gruntów? Czy brak wartości oznacza, że emisje są tam zerowe?

## Clima 2

Nie. **Brak wartości nie oznacza zerowych emisji** — oznacza, że dla tych kategorii nie wprowadzono jeszcze danych ani oceny.

W inwentaryzacji za 2024 r.:
- **IPPU / procesy przemysłowe i użytkowanie produktów (IV):** brak 2 z 2 wymaganych pozycji.
- **AFOLU / rolnictwo, leśnictwo i użytkowanie gruntów (V):** brak 3 z 3 wymaganych pozycji.

Zanim raport zostanie przekazany, dla każdej pozycji należy ustalić, czy:
1. występuje i wymaga oszacowania emisji,
2. **nie występuje** na terenie miasta — wtedy można oznaczyć ją jako „nie występuje”, z krótkim uzasadnieniem,
3. danych nie da się uzyskać lub oszacować — wtedy należy to jasno udokumentować zgodnie z metodyką inwentaryzacji.

Dopiero potwierdzone „nie występuje” może uzasadniać brak emisji w danej kategorii; nie należy automatycznie traktować pustych pól jako zera.

Czas do końca odpowiedzi (wraz z UI): 8.8 s.

## Użytkownik 3

Jakie konkretne dane i źródła powinnam zebrać oraz gdzie w aplikacji sprawdzić lub uzupełnić te luki? Na razie niczego nie zmieniaj.

## Clima 3

Nic nie zmieniam.

Dla inwentaryzacji 2024 warto przejść do kategorii **IV — IPPU** oraz **V — AFOLU** i dla każdej brakującej pozycji albo wprowadzić dane, albo oznaczyć ją jako „nie występuje” wraz z uzasadnieniem i źródłem.

### IV. Procesy przemysłowe i użytkowanie produktów (IPPU)
Zbierz przede wszystkim informacje o działalnościach, które powodują emisje **inne niż ze spalania paliw**:

- **Zakłady przemysłowe i procesy technologiczne:** rodzaj zakładu i produkcji, roczna produkcja lub zużycie surowców (np. cement, wapno, szkło, metale, chemikalia), dane o procesach mogących emitować CO₂ lub inne gazy.
- **Czynniki chłodnicze / F-gazy:** liczba i typ urządzeń chłodniczych oraz klimatyzacyjnych, rodzaje i ilości stosowanych czynników, serwis, ubytki i odzysk czynnika — szczególnie w większych obiektach handlowych, magazynach chłodniczych, szpitalach i zakładach.
- **Źródła danych:** urząd miasta (wydziały środowiska, działalności gospodarczej lub budownictwa), krajowy/regionalny urząd statystyczny, rejestry pozwoleń i zgłoszeń środowiskowych, operatorzy zakładów, firmy serwisujące chłodnictwo oraz właściwy krajowy raport inwentaryzacyjny.

Jeżeli na terenie miasta nie ma procesów przemysłowych objętych tą kategorią, udokumentuj to np. przeglądem rejestru działalności i pozwoleń środowiskowych. Nie zakładaj automatycznie, że nie występują także emisje z chłodnictwa.

### V. Rolnictwo, leśnictwo i użytkowanie gruntów (AFOLU)
Potrzebne dane obejmują trzy grupy:

- **Zwierzęta gospodarskie:** liczebność według gatunku i systemu chowu; dane o gospodarowaniu nawozami naturalnymi. Pozwala to oszacować metan z fermentacji jelitowej i z zarządzania odchodami.
- **Grunty i zmiany użytkowania gruntów:** powierzchnia lasów, gruntów ornych, użytków zielonych, terenów podmokłych i terenów zabudowanych oraz zmiany między tymi kategoriami w roku raportowym i w latach poprzednich. Ważne są też wycinki, nasadzenia i rekultywacje.
- **Emisje inne niż CO₂ z gruntów:** zużycie nawozów mineralnych i organicznych, powierzchnia upraw, ewentualnie uprawa ryżu lub wypalanie pozostałości rolniczych — jeśli występują lokalnie.
- **Źródła danych:** lokalny lub regionalny urząd statystyczny, ewidencja gruntów i budynków, urząd geodezji/katastru, wydział planowania przestrzennego, administracja leśna, urząd rolnictwa, dane satelitarne i pokrycia terenu oraz ankiety wśród większych gospodarstw.

### Gdzie sprawdzić i uzupełnić w CityCatalyst
1. Otwórz inwentaryzację **2024**.
2. Przejdź do widoku kategorii/sektorów emisji.
3. Otwórz kolejno **IV — IPPU** i **V — AFOLU** — w tych sektorach są obecnie wszystkie pozycje niewypełnione: odpowiednio **2 z 2** oraz **3 z 3**.
4. W każdej pozycji sprawdź, czy można dodać dane aktywności i źródło, wprowadzić oszacowanie albo oznaczyć kategorię jako **„nie występuje”** z uzasadnieniem. Nie wybieraj wartości zero tylko dlatego, że danych jeszcze nie ma.

Metodycznie najczęściej oblicza się emisje jako **dane aktywności × współczynnik emisji**; preferowane są dane lokalne i krajowe z wiarygodnych źródeł. IPPU obejmuje m.in. procesy przemysłowe oraz uwalnianie gazów z produktów takich jak czynniki chłodnicze, a AFOLU — zwierzęta, grunty i zmiany ich użytkowania oraz emisje związane z nawożeniem. Źródło: **wewnętrzna baza wiedzy klimatycznej** (GPC).

Czas do końca odpowiedzi (wraz z UI): 23.5 s.
