# UB05-r2 — Luki przed oddaniem inwentaryzacji

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T11:00:21.875Z — 2026-11-01T11:01:17.057Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Zanim przekażę przełożonej wyniki za 2024 rok, chciałabym sprawdzić kompletność naszej inwentaryzacji. Które obszary mają luki?

## Clima 1

Dla inwentaryzacji **Brzeg Nadziei (test), 2024** kompletność wynosi obecnie **8%**: uzupełniono 4 z 48 wymaganych pozycji, a **44 pozostają brakujące**.

Luki według obszaru:
- **Energia stacjonarna (I):** 19 z 21 pozycji brakuje — kompletność 10%.
- **Transport (II):** 13 z 14 brakuje — kompletność 7%.
- **Odpady (III):** 7 z 8 brakuje — kompletność 13%.
- **Procesy przemysłowe i użytkowanie produktów / IPPU (IV):** brak wszystkich 2 wymaganych pozycji — 0%.
- **Rolnictwo, leśnictwo i użytkowanie gruntów / AFOLU (V):** brak wszystkich 3 wymaganych pozycji — 0%.

Wszystkie obecnie wprowadzone dane pochodzą z wpisów ręcznych lub plików — nie ma jeszcze danych ze źródeł zewnętrznych.

Czas do końca odpowiedzi (wraz z UI): 12.2 s.

## Użytkownik 2

A co z procesami przemysłowymi oraz rolnictwem i użytkowaniem gruntów? Czy brak wartości oznacza, że emisje są tam zerowe?

## Clima 2

Nie. **Brak wartości nie oznacza automatycznie zerowych emisji.**

Dla inwentaryzacji za 2024:
- **IPPU / procesy przemysłowe i użytkowanie produktów:** nie uzupełniono **2 z 2** wymaganych pozycji.
- **AFOLU / rolnictwo, leśnictwo i użytkowanie gruntów:** nie uzupełniono **3 z 3** wymaganych pozycji.

To znaczy, że te emisje **nie zostały jeszcze oszacowane ani oznaczone jako niewystępujące**. Nie można więc na tej podstawie stwierdzić, że wynoszą zero.

W raportowaniu zgodnym z GPC należy rozróżniać m.in.:
- **„nie występuje” (NO)** — dana działalność nie ma miejsca w mieście lub emisje są pomijalne; wymaga uzasadnienia,
- **„nie oszacowano” (NE)** — emisje mogą występować, ale nie zostały obliczone lub zgłoszone,
- **„ujęto gdzie indziej” (IE)** — emisje są wykazane w innej kategorii,
- **wartość 0** — można podać dopiero, gdy dane lub obliczenia potwierdzają brak emisji.

Przed przekazaniem wyników warto więc dla każdej z tych pięciu pozycji ustalić, czy źródło rzeczywiście nie występuje, czy wymaga oszacowania. W GPC kategorie IPPU i AFOLU są elementem poziomu raportowania **BASIC+**, jeśli są istotne dla miasta.  
Źródło: wewnętrzna baza wiedzy klimatycznej (GPC).

Czas do końca odpowiedzi (wraz z UI): 12.7 s.

## Użytkownik 3

Jakie konkretne dane i źródła powinnam zebrać oraz gdzie w aplikacji sprawdzić lub uzupełnić te luki? Na razie niczego nie zmieniaj.

## Clima 3

Nie będę nic zmieniać. W inwentaryzacji **2024** brakuje obecnie dwóch pozycji w **IPPU (IV)** i trzech w **AFOLU (V)**. Najpierw warto zebrać dane oraz ustalić dla każdej pozycji, czy źródło faktycznie występuje na terenie miasta.

## IV. Procesy przemysłowe i użytkowanie produktów (IPPU)

Zbierz informacje o emisjach **niezwiązanych ze spalaniem paliw**:

1. **Procesy przemysłowe**
   - zakłady produkujące lub przetwarzające m.in. cement/wapno, szkło, metale, chemikalia, nawozy, chłodziwa;
   - roczna produkcja lub zużycie surowców (np. tony klinkieru, wapna, stali, szkła);
   - stosowane technologie i, jeśli są dostępne, bezpośrednie dane emisyjne zakładów.

2. **Użytkowanie produktów**
   - dane o zakupie, serwisowaniu, uzupełnianiu i odzysku czynników chłodniczych (HFC i inne F-gazy) w chłodnictwie, klimatyzacji, pompach ciepła i pojazdach;
   - w miarę istotności: użycie pianek, aerozoli, gaśnic i innych produktów zawierających fluorowane gazy cieplarniane.

**Najlepsze źródła:**
- wydział ochrony środowiska lub gospodarki miasta;
- lokalne zakłady przemysłowe i ich raporty środowiskowe/pozwolenia;
- regionalne lub krajowe rejestry emisji i instalacji przemysłowych;
- firmy serwisujące urządzenia chłodnicze i klimatyzacyjne;
- krajowy raport inwentaryzacyjny oraz krajowe wskaźniki emisji, gdy nie ma danych lokalnych.

Jeżeli w granicach miasta nie ma istotnego przemysłu procesowego ani danych wskazujących na użycie odpowiednich produktów, można rozważyć oznaczenie pozycji jako **„nie występuje”**, ale z krótkim uzasadnieniem — nie jako puste pole.

## V. Rolnictwo, leśnictwo i użytkowanie gruntów (AFOLU)

Trzy brakujące obszary odpowiadają zwykle kategoriom GPC:

1. **V.1 Hodowla**
   - liczba zwierząt według gatunku (np. bydło, trzoda, owce, drób);
   - systemy utrzymania i gospodarowania obornikiem/gnojowicą;
   - dane o produkcji biogazu lub odzysku metanu, jeśli występuje.

   **Źródła:** spis rolny, urząd/statystyka publiczna, lokalne biuro rolnictwa, ewidencja gospodarstw, ankiety do większych gospodarstw.

2. **V.2 Grunty**
   - powierzchnia i zmiany użytkowania gruntów: lasy, grunty orne, łąki i pastwiska, tereny podmokłe, tereny zabudowane;
   - wycinka, zalesienia, przekształcanie gruntów na zabudowę lub grunty rolne;
   - dane o biomasie drzew i zieleni miejskiej, jeśli są dostępne.

   **Źródła:** miejski wydział planowania i środowiska, ewidencja gruntów, plany zagospodarowania, dane geodezyjne/GIS, zarząd zieleni, nadleśnictwo lub zarządcy lasów, zdjęcia satelitarne i krajowe bazy pokrycia terenu.

   W tej kategorii należy uwzględniać zarówno **emisje**, jak i **pochłanianie CO₂** przez lasy i inną roślinność, gdy metodyka i dane na to pozwalają.

3. **V.3 Pozostałe źródła i emisje nie-CO₂ z gruntów**
   - zużycie nawozów mineralnych i organicznych;
   - powierzchnia upraw oraz, jeśli dotyczy, upraw ryżu;
   - wypalanie resztek roślinnych lub pożary na terenach zarządzanych;
   - osuszane gleby organiczne/torfowiska, jeśli występują.

   **Źródła:** statystyka rolnicza, lokalne dane o sprzedaży lub stosowaniu nawozów, ankiety gospodarstw, zarządcy terenów podmokłych, służby leśne i przeciwpożarowe.

GPC wskazuje, że przy dostępności danych warto stosować dane lokalne lub krajowe; jeśli ich brakuje, można zastosować współczynniki domyślne IPCC i udokumentować założenia. Źródło: **wewnętrzna baza wiedzy klimatycznej**, GPC.

## Gdzie sprawdzić i uzupełnić w CityCatalyst

W inwentaryzacji **GHGI 2024** przejdź do widoku sektorów/kategorii emisji i otwórz kolejno:
- **IV — IPPU**, aby zobaczyć 2 brakujące pozycje;
- **V — AFOLU**, aby zobaczyć 3 brakujące pozycje.

Przy każdej pozycji:
1. sprawdź, jakie dane aktywności i jednostki są wymagane;
2. dodaj dane źródłowe lub wynik oszacowania;
3. zapisz źródło, rok danych, metodę i współczynnik emisji;
4. jeśli kategoria nie występuje, oznacz ją jako **„nie występuje”** i wpisz uzasadnienie;
5. jeśli działalność występuje, ale danych jeszcze nie ma, pozostaw ją jako **„nie oszacowano”** — nie wpisuj zera.

Najpilniejsze jest potwierdzenie z wydziałem środowiska/planowania, czy na obszarze miasta występują: zakłady procesowe, istotne instalacje chłodnicze, gospodarstwa ze zwierzętami, grunty rolne, lasy lub tereny podmokłe.

Czas do końca odpowiedzi (wraz z UI): 23.8 s.
