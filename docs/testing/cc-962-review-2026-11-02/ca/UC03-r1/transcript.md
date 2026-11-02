# UC03-r1 — Wybranie jednej propozycji i zapis do inwentarza

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:47:56.726Z — 2026-11-01T10:50:23.898Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

Uwaga techniczna: The recorder initially checked only persisted decisions and missed one valid active staged selection. It cancelled the valid card. This was a harness issue, not a product defect. Original recording and all turns are retained.

Film łączy dwa oryginalne segmenty. Pierwszy zachowuje anulowanie przez błędny warunek bezpieczeństwa nagrywarki; drugi pokazuje kontynuację tej samej rozmowy i rzeczywisty zapis.

## Użytkownik 1

Pomóż mi uzupełnić energię stacjonarną dla São Paulo za 2022 rok. Najpierw pokaż mi propozycje do sprawdzenia.

## Clima 1

Przygotowuję propozycje z podłączonych źródeł. Pojawią się w panelu przeglądu, gdy będą gotowe.

Czas do końca odpowiedzi (wraz z UI): 17.2 s.

## Użytkownik 2

Chcę przyjąć wyłącznie propozycję SEEG dla budynków mieszkalnych, zakres 1 (I.1.1). Pozostałe zostawmy do późniejszego przeglądu.

## Clima 2

Przyjąłem propozycję **SEEG** dla **budynków mieszkalnych — zakres 1 (I.1.1)**. Pozostałe 14 propozycji pozostaje niezmienionych do późniejszego przeglądu.

Czas do końca odpowiedzi (wraz z UI): 10.0 s.

## Użytkownik 3

Chcę zapisać do inwentarza tylko tę jedną wybraną wartość. Pokaż mi potwierdzenie zapisu.

## Clima 3

Wyświetliłem potwierdzenie zapisu do inwentarza. Zapis obejmie tylko jedną zaakceptowaną wartość: **SEEG dla budynków mieszkalnych, zakres 1 (I.1.1)**.

Czas do końca odpowiedzi (wraz z UI): 9.1 s.

## Użytkownik 4

Co dokładnie zostało zapisane i co nadal wymaga mojej decyzji?

## Clima 4

**Nic nie zostało jeszcze zapisane do inwentarza** — wyświetlono jedynie kartę potwierdzenia zapisu.  

W wersji roboczej jest przygotowany jeden wybór do zapisu:
- **Budynki mieszkalne, zakres 1 (I.1.1)** — źródło **SEEG**.  
  Propozycja obejmuje emisje ze spalania paliw w granicach miasta.

**Nadal wymaga decyzji 14 pozycji:**
- **12 propozycji źródłowych** dla pozostałych wierszy mieszkaniowych, komercyjnych, przemysłowych, energetycznych i rolniczych;
- **2 propozycje klucza notacyjnego „NO”** dla emisji ulotnych z systemów ropy i gazu oraz z łańcucha węglowego — źródła wskazują, że w granicach miasta nie znaleziono odpowiednich instalacji.

Dodatkowo **6 wierszy nie ma obecnie dostępnego źródła danych** (m.in. część pozycji energetycznych oraz „nieokreślone źródła”); możesz je pozostawić puste lub później nadać odpowiedni klucz notacyjny.

Czas do końca odpowiedzi (wraz z UI): 14.5 s.

## Użytkownik 5

Chcę teraz zapisać wcześniej wybraną propozycję SEEG dla budynków mieszkalnych, zakres 1 (I.1.1). Pozostałe nadal zostaw do późniejszego przeglądu. Pokaż potwierdzenie zapisu.

## Clima 5

Wyświetliłem potwierdzenie zapisu do inwentarza. Obejmie ono tylko wcześniej wybraną propozycję **SEEG dla budynków mieszkalnych, zakres 1 (I.1.1)**; pozostałe pozycje pozostaną do późniejszego przeglądu.

Czas do końca odpowiedzi (wraz z UI): 10.2 s.

## Użytkownik 6

Co dokładnie zostało zapisane i co nadal wymaga mojej decyzji?

## Clima 6

Do inwentarza zapisano **jedną wartość**:

- **Budynki mieszkalne — zakres 1 (I.1.1), emisje ze spalania paliw w granicach miasta**
  - źródło: **SEEG** (Sistema de Estimativa de Emissão de Gases do Efeito Estufa).

Pozostałe wiersze nie zostały zapisane i nadal są w wersji roboczej do przeglądu:

- **14 propozycji z dostępnym źródłem** czeka na decyzję (akceptacja, wybór źródła albo pozostawienie w szkicu);
- **6 wierszy nie ma obecnie dostępnego źródła danych** — w razie potrzeby można później zastosować właściwy klucz notacyjny lub pozostawić je bez wartości.

Czas do końca odpowiedzi (wraz z UI): 9.0 s.
