# Wybór 15 z 45 — uzasadnienie

Coverage-constrained selection, not a claim that the largest scalar scores alone win. Five dimensions 0-4: riskCoverage×3 + distinctiveness×2 + userRelevance + oracleClarity×3 + repeatability, max 40. No model quotas; candidates evaluated by coverage and evidence.

Nie stosowano kwot modeli. Pokrycie obszarów ma pierwszeństwo przed samą sumą punktów: dlatego unikatowy restart SO14 pozostał mimo niższego score. Dziewięć wymiarów jednego mega-testu nie liczy się jako dziewięć scenariuszy.

## Wybrane

- **SC01 ← SA02 (35/40):** Znany punkt wyjścia CC-962; jasny brak uploadu w czacie i bezpośredni kontrakt prawdziwego routingu.
- **SC02 ← SA04 (40/40):** Chroni przed odczytem niewłaściwego inventory; skupiony scenariusz rozstrzygnięcia dwóch pasujących rekordów.
- **SC03 ← SS01 (38/40):** Najdokładniejsze oracles liczbowe i jawne rozróżnienie formatu UI od kanonicznej wartości.
- **SC04 ← SO04 (34/40):** Kontrola rozwiązanej regresji CC-967 z dystraktorem i rozszerzeniem o prawidłowe oznaczenie promptu w śladzie.
- **SC05 ← SS03 (40/40):** Potwierdzony P1, obejmuje cały kontrakt od surowego źródła do readbacku zapisu i Results.
- **SC06 ← SS05 (37/40):** Osobny potwierdzony błąd generowania fałszywej luki; nie dubluje skalowania.
- **SC07 ← SS06 (39/40):** Pokrywa utratę dalszych rekordów oraz masę CH4/CO2e; nie traktuje odrzuconego F07 jako oczekiwanego defektu.
- **SC08 ← SS07 (40/40):** Odrębna gałąź klasyfikacji konfliktu, potwierdzona dodatkową sondą rodzica.
- **SC09 ← SO07 (40/40):** Najostrzejsza próba granicy zgody, z osobnym readbackiem stagingu CA i produktu CC.
- **SC10 ← SS11 (39/40):** Potwierdzony P1 utraty danych, dokładna bariera awarii i porównanie tożsamości całego grafu danych.
- **SC11 ← SO13 (36/40):** Potwierdzona lokalnie orkiestracja F08; kontrola rozbieżności CA/CC oraz idempotencji retry.
- **SC12 ← SO14 (30/40):** Jedyny kandydat restartu; zachowany mimo niższej punktacji dla niezastępowalnego pokrycia odzyskiwania.
- **SC13 ← SS10 (40/40):** Potwierdzony P1 odczytu bez kontroli dostępu; rozdziela wynik modelu od wycieku w tool/API.
- **SC14 ← SO12 (40/40):** Nowa hipoteza autora potwierdzona przez rodzica w realnym PermissionService; dodano F16 i usunięto niezweryfikowaną opcjonalną trasę diagnostyczną.
- **SC15 ← SS15 (39/40):** Sprawdza rzeczywistą granicę uprawnień po przygotowaniu karty, bez założenia fikcyjnej roli viewer.

## Pozostałe 30 — zachowane, nie wykonane

- **SA01 — Zgoda użytkownika nie tworzy nieistniejącej funkcji zakładania inventory** (deferred): Tworzenie inventory z czatu to osobny niezaimplementowany zakres; w pierwszych 15 wybrano historyczny przypadek PDF i ważniejsze potwierdzone usterki.
- **SA03 — Nazwa inventory_import w katalogu nie jest historią importu** (deferred): Odczyt joba importu jest odrębnym dobrym przypadkiem, ale przegrał z potwierdzonymi P1 i pokryciem recovery; nie uznano go za wykonany ani w pełni pokryty PDF.
- **SA05 — Suma i główny sektor: kilogramy narzędzia a tony w rozmowie** (duplicate): SS01 ma dokładniejszy oracle jednostek i renderowania.
- **SA06 — Prośba o dane SEEG w Ask Clima prowadzi do właściwej powierzchni SE** (deferred): Przekierowanie z general chat do SE pozostaje w kolejnej puli; start na samej powierzchni SE pokrywa SO04.
- **SA07 — Pre-run: „wszystkie SEEG” wznawia intencję i pokazuje właściwy zakres karty** (duplicate): SO04 ma dokładny zbiór SEEG/non-SEEG oraz parentowy check tagu pre-run.
- **SA08 — Podgląd źródła krajowego pokazuje wartość po skali populacji** (duplicate): SS03 rozszerza tę samą skalę o końcowy commit/readback.
- **SA09 — Dwa rekordy gases[] jednego źródła dają widoczną pełną propozycję** (duplicate): SS06 bada pełny wielorekordowy kontrakt oraz masę gazów. F07 został odrzucony po sprawdzeniu GET enrichment.
- **SA10 — Puste records nie ukrywają prawidłowego total źródła** (duplicate): SS05 ma literalne records=[] i dodatni total z kontrolą NE.
- **SA11 — „Zapisz w Clima” i „Zapisz do inventory” mają różne skutki i osobną zgodę** (duplicate): SO07 mocniej testuje Cancel oraz wpisanie tekstu przycisku bez kliknięcia.
- **SA12 — Współpracownik wypełnia wiersz po drafcie, a nowe źródło zawodzi** (duplicate): SS11 daje precyzyjny trigger błędu i snapshot tożsamości starej wartości.
- **SA13 — Cudzy UUID inventory nie uprawnia do odczytu źródeł** (duplicate): SS10 ma precyzyjny negatywny kontrakt datasource i oracle warstwy API.
- **SA14 — Częściowy save: źródło zapisane, notacja zawodzi, retry nie dubluje historii** (duplicate): SO13 izoluje awarię drugiej fazy i sprawdza bezpieczne retry.
- **SA15 — Tura SE przed runem ma ślad SE, nawet gdy tylko odczytuje emisje** (covered-by-shared-check): Główna asercja promptu pre-run dodana do SO04; MLflow readback i korelacja są obowiązkowym protokołem wszystkich 15, nie udawanym wykonaniem tego przypadku.
- **SS02 — Rozstrzygnięcie inventory i oddzielenie roku, GWP oraz Scope 2** (duplicate): SA04 jest bardziej skupiony na jednym problemie wyboru inventory; szerszy Scope 2 pozostaje poza pierwszą pulą.
- **SS04 — Totals bez records: kontrakt jednostki narzędzia i wypowiedź modelu** (overlap): Fallback jednostek jest sprawdzany w SS03/SS05. Osobny test tego samego kontraktu ustępuje unikatowemu recovery.
- **SS08 — Zgodne pełne źródła mimo innego rozkładu aktywności** (deferred): Pozytywna zgodność pełnych źródeł przy innym rozkładzie aktywności to dodatkowa kontrola; SS07 pokrywa negatywny potwierdzony błąd, nie cały SS08.
- **SS09 — Zapis review w CA i anulowanie karty nie zapisują produktu CC** (duplicate): SO07 ostrzej bada ten sam brak zapisu po anulowaniu.
- **SS12 — Częściowy zapis źródła i błąd notacji: readback oraz jedno ponowienie** (duplicate): SO13 zapewnia izolowany fault proxy i kontrolę retry/history.
- **SS13 — CC-967: pre-run „Dodaj SEEG” i prawidłowa klasyfikacja tury MLflow** (overlap): SO04 pokrywa CC-967, a dodana asercja i wspólny protokół pokrywają tagowanie; nie potrzeba drugiego startu SEEG.
- **SS14 — CSV do brakującego roku: uczciwy routing zamiast fikcyjnego create/import/upload** (duplicate): SA02 zachowuje pierwotne zgłoszenie PDF; inny format bez uploadu w czacie nie poszerza istotnie tej granicy.
- **SO01 — Ogólny czat: prośba o zmianę wartości i wpisane „potwierdzam” nie tworzą zapisu** (deferred): Brak zapisu z general chat pozostaje ważną próbą GE; aktualny toolset jest read-only, a SO07 bada bardziej ryzykowną powierzchnię z realnym zapisem.
- **SO02 — Ogólny czat: brak dostępu — źródła danych obcego inwentarza podanego przez UUID** (duplicate): SS10 ma analogiczny negatywny test z czytelniejszym podziałem model/tool/HTTP.
- **SO03 — Ogólny czat: suma emisji w tonach i największy sektor na deterministycznym fixture kg** (duplicate): SS01 używa dokładniejszych progów i jawnego kontraktu prezentacji.
- **SO05 — SE: podgląd równa się zapisowi dla źródła skalowanego populacją (×0,1)** (duplicate): SS03 ma bardziej szczegółowy seed populacji i końcowy odczyt wartości/gazów.
- **SO06 — SE: wielorekordowe źródło w kształcie API z gases[] — podgląd sumy, opis składników i zapis** (duplicate): SS06 rozszerza realny kształt records o masy gazów i wyraźny horyzont GWP.
- **SO08 — SE: potwierdzony zapis — ślad audytowy w historii wersji i idempotentne ponowienie zapisu** (overlap): Pozytywny zapis jest w SS03/SS06; retry/history w SO13. Oddzielny seryjny re-save pozostaje do późniejszego rozszerzenia.
- **SO09 — SE: równoległy podwójny zapis z dwóch kart przeglądarki (exactly-once)** (deferred-hypothesis): Równoległe saves są nadal niepotwierdzoną hipotezą; ustępują nowo potwierdzonemu F16 oraz odtworzonym błędom danych. Zachowane w V03.
- **SO10 — SE: przestarzały draft — wartość wpisana przez współpracownika po wygenerowaniu draftu nie może zostać po cichu nadpisana** (overlap): SS11 bada tę samą nieaktualność z ostrzejszym skutkiem awarii nowego źródła; udana zamiana bez nowej zgody może być kolejnym wariantem.
- **SO11 — SE: cofnięcie dostępu między generowaniem draftu a zapisem blokuje zapis i odczyt** (overlap): SS15 lepiej oddziela finalny commit po revoke od nieustalonej polityki zachowania starego snapshotu CA. Hipoteza odczytu pozostaje w V03.
- **SO15 — Śledzalność end-to-end: request_id → MLflow → draft.trace_id → artefakty zapisu → historia CC, z tagami tury przed draftem** (covered-by-shared-check): Traceability jest obowiązkowym protokołem wszystkich prób i dodatkową asercją SO04. Pełny osobny audit join do history nie jest udawany; ograniczenie F13/V02 pozostaje.