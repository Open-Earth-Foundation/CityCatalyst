# CC-962 — ponowny skan i wybór 15 scenariuszy

Data: 2026-11-01 (Europe/Warsaw). Kod: `fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9`.

## Co zrobiono i sprawdzono

- Dwa niezależne skany: Astra i Opus; nowa trójka autorów: Astra, Opus i Sol (po 15).
- Przypięty develop fb6a0d000; porównano 18/18 wpisów baseline 6a9ab077f z 26 października.
- 140 unikatowych istniejących testów rodzica: 91 pytest core + 12 auth/observability + 37 Jest; wszystkie przeszły. Powtórzonych testów agentów nie dodano ponownie.
- 9 lokalnych testów observability wykonało realny eksport i readback MLflow SQLite/artifacts; połączenia poza loopback były blokowane.
- Dodatkowe sondy: realne funkcje TS/Python, Decimal i PermissionService; DB/transport/history były atrapami. Potwierdzenia z tych sond nie są pełnym E2E.
- Wykonano kontrolę no-force, awarii pierwszej i drugiej fazy, prywatnego inventory oraz kontrolę aktywnego runu dla metadanych.
- Sprawdzono Linear CC-950/951/953/960/967 i komentarz o ręcznym charakterze backtestu. CC-967 jest Done; CC-950 Todo; CC-951 i CC-953 In Progress; CC-960 Done.
- Sprawdzono caller GET enrichment i odrzucono F07 jako brak wartości UI. CA i warstwa agentowa CC są niezmienione względem baseline; nowe ustalenia są nowo odkryte, nie dowiedzionymi świeżymi regresjami.
- Nie zmieniono kodu aplikacji, nie commitowano, nie pushowano, nie tworzono PR/ticketów i nie naprawiano usterek.

## Granice dowodu

Nie uruchomiono nowych prób modelu/stagingu/przeglądarki, PostgreSQL ani backtestu CC-951. Nie odczytano deployed MLflow. GE/UW/PV nie wynoszą 0 — są niezmierzone. F09 ma dowód z kodu; F14/F15/V03 pozostają wyraźnie ograniczone. Dwa błędy importu/kształtu i brak re-exportowanego enuma w sondach były błędami harnessu i zostały poprawione bez zmian aplikacji.

## Co zmieniło się względem poprzedniej tabeli

8 pozycji potwierdza opis stanu, 9 wymaga korekty opisu, 1 pozostaje bez pomiaru. Korekta nie oznacza dostarczenia całego wymagania. Kod CA/agentic nie zmienił się od baseline; doszedł fundament ingestion (908 linii), nie kompletna agentowa ścieżka importu.

- **D1 — potwierdzony stan:** Transport/Waste/IPPU/AFOLU to nadal planned scope, nie regresja.
- **D2 — korekta opisu:** Korekta: manual API i IE/C istnieją; brak osiągalnego manual-entry tool/UI, research i upload pozostaje.
- **D3 — potwierdzony stan:** UI import nie jest uploadem agenta.
- **D4 — korekta opisu:** Brak osobnego calculate nie oznacza braku obliczeń. Automatyczny wynik w chat nie jest gwarantowany; A02/A05.
- **D5 — potwierdzony stan:** Katalog GHGI nie jest import-job ani approve.
- **D6 — brak pomiaru:** Nie wykonano full inventory z dwoma fallbackami; D1/D2 nadal blokują funkcjonalną kompletność.
- **D7 — korekta opisu:** Tak, nowe wartości i notation mają history. Replacement nieatomowy (A01); kompletna zgodność schema/values/restore niezweryfikowana.
- **S1 — potwierdzony stan:** Brak create z confirmation.
- **S2 — korekta opisu:** Korekta discovery: GHGI inventory jest w native catalog. Mapping/status/row counts konkretnego importu nadal brak.
- **S3 — korekta opisu:** API istnieje; bezwarunkowe Done dla poprawności źródeł jest zbyt mocne przez A02/A04/A05.
- **S4 — korekta opisu:** Backend manual nie oznacza tool/chat UI. Confirmation jest; A01 narusza spójność zapisu.
- **S5 — potwierdzony stan:** Odczyt działa w testach; live UI parity niezmierzona. Błędy draft preview nie dowodzą błędu ResultsService.
- **S6 — potwierdzony stan:** Planowane, nie regresja.
- **S7 — korekta opisu:** Native katalog poszerza bazę; CA nadal ręcznie składa tools, bez jednego generatora.
- **S8 — potwierdzony stan:** UI gate istnieje, shared pending-action brak. Nie wykazano samodzielnego commit modelu.
- **S9 — korekta opisu:** IngestRunner ma Validate/Decide, lecz to nie jest produkcyjnie podłączony wspólny import runtime.
- **S10 — korekta opisu:** Repo włącza flagę; działający eksport/readback unverified. Request ID różni się od MLflow trace ID.
- **S11 — potwierdzony stan:** Brak listy ograniczeń nadal obecny. Baseline G03 'expect fail' nie jest wynikiem nowej próby.

### Ważne korekty faktów

- `get_all_datasources` omija kontrolę dostępu (F02), więc stare zdanie o autoryzacji każdego wywołania było za szerokie.
- 403 i 404 są rozróżniane; polityka maskowania istnienia wymaga decyzji (F15).
- Zwykły członek z dostępem może edytować; to nie znaczy, że PUBLIC_READER powinien edytować. F16 potwierdza błędny grant dla publicznego inventory.
- Manual backend, NO/NE/IE/C i historia create istnieją. Brakuje części osiągalnych narzędzi/UI i powiązania workflow; nie należy pisać, że wszystko jest nieobecne.
- Native catalog obejmuje GHGI inventory, lecz nie joby importu i ich mapping/row counts.
- CC-967 jest rozwiązane i ma być kontrolą regresji. CC-951 dostarcza golden set, CC-950 ręczny backtest.

## Odrzucony kandydat

**F07:** sama funkcja formattera nie obsługuje gases[], ale rzeczywisty GET woła enrichment i uzupełnia wartość przed UI. Kontrdowód jest w root-node-probe-results.json. Nie policzono F07 jako otwartej usterki. Pozostaje F06: pierwszy rekord nadal nie jest sumą źródła.

## Wybrane 15 z 45

- **SC01 ← SA02 (P2):** Granice czatu: PDF prowadzi do importu UI
- **SC02 ← SA04 (P2):** Wybór właściwego inventory, roku, typu i GWP
- **SC03 ← SS01 (P1):** Suma emisji i udział sektora: kg w narzędziu, t w odpowiedzi
- **SC04 ← SO04 (P2):** Pre-run SE: start i kontynuacja prośby o SEEG
- **SC05 ← SS03 (P1):** Skalowanie populacji: preview musi równać się commit
- **SC06 ← SS05 (P2):** Puste records z poprawnym totals
- **SC07 ← SS06 (P1):** Wiele rekordów i masy gazów: pełny podgląd i zapis
- **SC08 ← SS07 (P1):** Różne sumy źródeł mimo identycznego pierwszego rekordu
- **SC09 ← SO07 (P1):** Cancel i tekst „potwierdzam” nie zastępują kliknięcia zapisu
- **SC10 ← SS11 (P1):** Edycja współpracownika i nieudana zamiana źródła
- **SC11 ← SO13 (P2):** Częściowy save i jedno bezpieczne ponowienie
- **SC12 ← SO14 (P2):** Restart generowania i single-flight retry
- **SC13 ← SS10 (P1):** Cudze źródła inventory: odmowa czatu i endpointu
- **SC14 ← SO12 (P1):** PUBLIC_READER nie może otrzymać prawa zapisu
- **SC15 ← SS15 (P1):** Cofnięcie dostępu przed finalnym zapisem

Szczegóły: [15 pełnych scenariuszy](CC-962-selected-15.md), [uzasadnienie wszystkich 45 decyzji](CC-962-selection-rationale.md), [pełna pula i decyzje JSON](all-45-and-selection.json). Wszystkie scenariusze są not-run.

## Jak czytać końcową listę

P1/P2/P3 opisuje ważność ustalenia; `bug`, `planned-gap`, `verification-gap` i `contract-risk` to różne kategorie. Dziesięć pozycji typu bug: dziewięć odtworzono lokalnie na określonej granicy, F09 pozostaje z kodu. F11 to stara luka promptu, a F12/F14/F15 nie są automatycznie pełnymi błędami zachowania modelu lub bypassami.

## Nierozwiązane rzeczy — pozostawione bez poprawek


### F01 · P1 · Nieudana lub nieaktualna zamiana źródła usuwa poprzednią wartość

**bug / local-test / względem baseline: new.**

Wywołanie forceReplace usuwa stary InventoryValue przed fetch/transaction. Awaria nowego źródła lub manual create pozostawia brak starej wartości. Aktywny lub wznowiony draft może również nadpisać edycję współpracownika.

Granica dowodu: DB i transport były atrapami; wariant manual ma atrapę kontraktu formularza. Nie wykonano próby PostgreSQL.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/backend/agentic/ghgi/stationary-energy/commit.ts:131](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/commit.ts#L131) — applySource is called with forceReplace=true.
- [app/src/backend/DataSourceService.ts:511](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/DataSourceService.ts#L511) — destroy poprzedza fetch i transakcję..
- [app/src/backend/agentic/ghgi/stationary-energy/commit.ts:213](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/commit.ts#L213) — Manual override: destroy, then createActivity separately.
- [app/src/backend/agentic/ghgi/stationary-energy/context.ts:160](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/context.ts#L160) — Wypełnione pola filtrowane przy starcie..

### F02 · P1 · Odczyt źródeł inventory pomija kontrolę dostępu

**bug / local-test / względem baseline: new.**

Rzeczywisty GET i apiHandler zwróciły HTTP 200 dla braku sesji oraz obcego użytkownika; PermissionService nie został wywołany. Dotyczy odczytu dopasowanych źródeł, nie dowodu dostępu do wszystkich zapisanych wartości inventory.

Granica dowodu: Rzeczywista logika handlera/wrappera, lecz baza i dane źródeł były syntetyczne. Sibling sector GET potwierdzony w kodzie; brak próby na wdrożeniu.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/app/api/v1/datasource/[inventoryId]/route.ts:10](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/datasource/%5BinventoryId%5D/route.ts#L10) — Swagger: no explicit authentication is enforced.
- [app/src/app/api/v1/datasource/[inventoryId]/route.ts:100](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/datasource/%5BinventoryId%5D/route.ts#L100) — GET has no session or permission check.
- [app/src/app/api/v1/datasource/[inventoryId]/route.ts:246](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/datasource/%5BinventoryId%5D/route.ts#L246) — POST checks canEditInventory (contrast).
- [app/src/app/api/v1/datasource/[inventoryId]/[sectorId]/route.ts:97](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/datasource/%5BinventoryId%5D/%5BsectorId%5D/route.ts#L97) — Sector GET has no permission check.

### F03 · P1 · Podgląd i zapis rozchodzą się po skalowaniu populacji

**bug / local-test / względem baseline: new.**

Propozycja zachowuje surowe 1 000 000 kg przy scaleFactor 0,1, a commit zapisuje 100 000 kg. Użytkownik powinien zatwierdzać tę samą fizyczną wartość, która trafi do inventory.

Granica dowodu: Realny Decimal i bieżący normalizer/commit/builder; brak pełnej ścieżki przeglądarki.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/backend/DataSourceService.ts:898](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/DataSourceService.ts#L898) — Współczynnik dodawany jako metadana..
- [app/src/backend/agentic/ghgi/stationary-energy/context.ts:742](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/context.ts#L742) — Brak mnożenia..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:463](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py#L463) — Propozycja kopiuje wiersz..
- [app/src/components/StationaryEnergyDraft/utils.ts:339](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/utils.ts#L339) — Formatter bez skali..

### F16 · P1 · PUBLIC_READER otrzymuje prawo edycji publicznego inventory

**bug / local-test / względem baseline: new.**

Rzeczywisty PermissionService.canEditInventory przyznał hasAccess=true i PUBLIC_READER zalogowanemu użytkownikowi spoza organizacji, bez odczytu członkostwa. Kontrola prywatnego inventory odmówiła 403. Ścieżki allowed-capabilities i commit SE używają tego samego canEditInventory.

Granica dowodu: Baza i ładowanie resource były atrapami. Potwierdzono błędny grant w autoryzatorze oraz callery; nie wykonano pełnego zapisu SE ani sprawdzenia osiągalności UI na wdrożeniu.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/backend/permissions/PermissionService.ts:93](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/permissions/PermissionService.ts#L93) — Public access przed membership.
- [app/src/backend/permissions/PermissionService.ts:187](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/permissions/PermissionService.ts#L187) — PUBLIC_READER.
- [app/src/backend/permissions/PermissionService.ts:380](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/permissions/PermissionService.ts#L380) — canEditInventory deleguje do canAccessInventory.
- [app/src/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted/route.ts:29](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted/route.ts#L29) — Commit ufa canEditInventory.

### F04 · P2 · Fallback totals opisuje kilogramy etykietą tCO2e

**bug / local-test / względem baseline: new.**

Liczba kg jest kopiowana bez przeliczenia jako tCO2e. Obecne obejście UI traktuje tco2e jak raw kg, ale model i utrwalony kontrakt nadal dostają sprzeczną jednostkę.

Granica dowodu: Dotyczy ścieżki totals fallback. Nie oznacza, że każda widoczna liczba jest tysiąckrotnie błędna.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/backend/agentic/ghgi/stationary-energy/context.ts:742](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/context.ts#L742) — Błędna etykieta jednostki..
- [app/src/components/StationaryEnergyDraft/utils.ts:15](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/utils.ts#L15) — tco2e w RAW_KG_EMISSIONS_UNITS..
- [app/src/components/StationaryEnergyDraft/utils.ts:348](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/utils.ts#L348) — Obejście formattera..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_chat_context.py:65](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_chat_context.py#L65) — Wiersze i propozycje w kontekście czatu..

### F05 · P2 · Puste records ukrywa prawidłowy total źródła

**bug / local-test / względem baseline: new.**

records=[] kończy normalizację; totals nie zostaje użyty, a builder daje gap mimo dostępnej wartości. Global API liczy totals i szczegóły odrębnymi zapytaniami.

Granica dowodu: Syntetyczny zgodny kontrakt; nie sprawdzono częstości tego kształtu w danych produkcyjnych.

Dowód rodzica: [root-python-probe-results.json](root-python-probe-results.json).
- [app/src/backend/agentic/ghgi/stationary-energy/context.ts:723](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/context.ts#L723) — Pusta tablica pomija totals..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:61](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py#L61) — Użyteczność tylko normalized_rows..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:122](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py#L122) — Powstaje gap..

### F06 · P2 · Tylko pierwszy rekord decyduje o propozycji i zgodności źródeł

**bug / local-test / względem baseline: new.**

Z dwóch rekordów 100 000 + 400 000 kg propozycja bierze pierwszy. Dwa źródła z sumami 500 000 i 1 000 000 kg są uznane za needs_review zamiast conflict, jeśli pierwszy rekord jest jednakowy.

Granica dowodu: Potwierdzono także kształt gases[] z kontraktu Global API; brak live danych referencyjnych.

Dowód rodzica: [root-python-probe-results.json](root-python-probe-results.json).
- [app/src/backend/agentic/ghgi/stationary-energy/context.ts:730](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/context.ts#L730) — Lista records..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:150](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py#L150) — Pierwszy wiersz w propozycji..
- [app/src/components/StationaryEnergyDraft/flow-review.ts:678](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/flow-review.ts#L678) — Pierwszy wiersz alternatywnego źródła..
- [app/src/components/StationaryEnergyDraft/utils.ts:430](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/utils.ts#L430) — Wyświetlenie wartości propozycji..

### F08 · P2 · Częściowy zapis pozostawia różny stan w CA i CC

**bug / local-test / względem baseline: new.**

Po udanej fazie źródeł i błędzie fazy notation keys orkiestracja nie utrwala wyników w CA. W sondzie fake CC zachował zapis, CA pozostało pending_cc_commit; kontrola błędu pierwszej fazy nie zapisywała nic.

Granica dowodu: Realna orkiestracja, lecz transport/repository i przygotowanie commit rows są atrapami. Nie uruchomiono HTTP/real rollback.

Dowód rodzica: [root-fault-probe-results.json](root-fault-probe-results.json).
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:1133](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L1133) — Two sequential CC commits.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:1216](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L1216) — Results are persisted only after both phases.
- [climate-advisor/service/app/routes/stationary_energy_drafts.py:200](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/routes/stationary_energy_drafts.py#L200) — Rollback on any exception.
- [climate-advisor/service/app/services/citycatalyst_client.py:832](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/citycatalyst_client.py#L832) — Timeout is datasource_timeout.

### F09 · P2 · Przerwany draft może pozostać generating i odpytuje się bez końca

**bug / code / względem baseline: new.**

Generation jest zadaniem asyncio w procesie, bez lease/heartbeat/startup recovery; frontend odpytuje co 2 s. Retry jest dopuszczone dla generating, bez wykazanego zabezpieczenia przed drugim workerem.

Granica dowodu: Restartu poda ani równoległych workerów nie odtworzono; to dowód z kodu, nie pomiar wdrożenia.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:94](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L94) — In-process background task.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:193](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L193) — Retry is only blocked for reviewed/saved/partially_saved.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:1419](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L1419) — Review and save return 409 while generating.
- [app/src/components/StationaryEnergyDraft/use-stationary-energy-draft-session.ts:194](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/use-stationary-energy-draft-session.ts#L194) — Unbounded 2 s polling.

### F10 · P2 · Tury SE przed startem draftu mają tagi zwykłego czatu

**bug / local-test / względem baseline: new.**

ChatWorkflowContext bez run ID daje prompt_name=chat i ca_agentic_flow=false, choć powierzchnia pre-run wybiera prompt SE. Kontrola z run ID daje stationary_energy_review.

Granica dowodu: Sonda funkcji telemetry oraz źródła wyboru promptu; nie odczytano tej tury ze wdrożonego MLflow.

Dowód rodzica: [root-python-probe-results.json](root-python-probe-results.json).
- [climate-advisor/service/app/utils/chat_workflow_context.py:62](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/utils/chat_workflow_context.py#L62) — Telemetry ignores the SE surface flag.
- [climate-advisor/service/app/services/agent_service.py:162](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L162) — The SE surface selects the SE prompt.
- [climate-advisor/service/app/services/agent_service.py:353](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L353) — Agent instructions = stationary_energy_review.
- [climate-advisor/service/app/utils/streaming_agent.py:50](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/utils/streaming_agent.py#L50) — SE surface is detected from the request marker.

### F11 · P2 · Ogólny prompt nie określa ograniczeń i routingu GHGI

**prompt-gap / code / względem baseline: still-valid.**

Brakuje jawnej instrukcji o braku upload/create/import/edit/import-job read oraz przekierowaniu do importu UI lub SE. Poprzednia luka S11 pozostaje.

Granica dowodu: Nie odtworzono nowej halucynacji modelu; stare zgłoszenie upload PDF nie jest bieżącym wynikiem live.
- [climate-advisor/prompts/chat.md:15](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/prompts/chat.md#L15) — Routing and output rules only; no limits section.
- [climate-advisor/prompts/tools/default_tool_policy.md:1](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/prompts/tools/default_tool_policy.md#L1) — Polityka odczytów..
- [climate-advisor/service/app/services/agent_service.py:278](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L278) — Start SE wymaga powierzchni SE..
- [climate-advisor/service/app/services/agent_service.py:353](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L353) — Wybór promptu..

### F12 · P3 · Backend manual override składa Mt i mt do tej samej skali

**contract-risk / local-test / względem baseline: new.**

Oba aliasy normalizują się do ×1 000 000 ton; t ma kontrolnie ×1. Zgodność z jednostką mt rozumianą w UI jako metric tonne wymaga jednoznacznego kontraktu.

Granica dowodu: Ścieżka API/backend, bez obecnego pola manual input w UI. Część semantyki wymaga decyzji Product/Data; nie wykazano błędnego zwykłego zapisu UI.

Dowód rodzica: [root-node-probe-results.json](root-node-probe-results.json).
- [app/src/backend/agentic/ghgi/stationary-energy/commit.ts:311](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/commit.ts#L311) — Case-folded unit map.
- [app/src/backend/agentic/ghgi/stationary-energy/commit.ts:224](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/commit.ts#L224) — Gas recorded as CO2.
- [app/src/app/api/v1/stationary-energy-drafts/[draftRunId]/review/route.ts:21](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/app/api/v1/stationary-energy-drafts/%5BdraftRunId%5D/review/route.ts#L21) — Free-string manual_unit.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_review.py:411](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_review.py#L411) — Manual rows are forwarded to CC.

### F13 · P3 · Historia nie wiąże jawnie zapisu agenta z workflow

**audit-gap / code / względem baseline: corrected.**

Historia create istnieje. Zapis nie przekazuje etykiety pochodzenia agent/UI ani identyfikatora workflow; usunięcie poprzedniej wartości bez delete version jest częścią F01.

Granica dowodu: Brak etykiety nie jest dowodem całkowitego braku historii. Nie przeprowadzono restore/history E2E.
- [app/src/backend/VersionHistoryService.ts:80](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/VersionHistoryService.ts#L80) — label option is available.
- [app/src/backend/DataSourceService.ts:567](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/DataSourceService.ts#L567) — No label is passed.
- [app/src/backend/DataSourceService.ts:521](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/DataSourceService.ts#L521) — Unversioned destroy.
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:131](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L131) — Draft trace_id = request id.

### F15 · P3 · Korekta baseline: brak dostępu i brak inventory mają różne błędy

**baseline-correction / code / względem baseline: corrected.**

Warstwa uprawnień odróżnia 403 od 404, a wrapper przekazuje status do modelu. Stary opis identycznej odpowiedzi jest nieprawdziwy.

Granica dowodu: Nie zaliczono automatycznie do bugów/security bypass: wymaganie maskowania istnienia nie jest uzgodnione.
- [app/src/backend/permissions/PermissionService.ts:117](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/permissions/PermissionService.ts#L117) — 404 vs 403.
- [climate-advisor/service/app/tools/inventory_context_tools.py:75](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/tools/inventory_context_tools.py#L75) — Status is passed to the model.

### G01 · P2 · Agentowy import nie ma kompletnej ścieżki start/status/confirm

**planned-gap / code / względem baseline: still-valid.**

Jest fundament IngestRunner i katalog GHGI inventory, ale brak produkcyjnego podłączenia agentowego importu, trwałego store, approve/resume i kompletnego pluginu GHGI na tym commicie.

Granica dowodu: Planowana integracja CC-953/CC-991/CC-993, nie nowa regresja UI importu.
- [app/src/backend/agentic/native-input-catalog/registry.ts:84](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/native-input-catalog/registry.ts#L84) — Tylko status/emissions..
- [app/src/backend/agentic/native-input-catalog/registry.ts:150](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/native-input-catalog/registry.ts#L150) — inventory_import kataloguje inventory..
- [app/src/backend/agentic/native-input-catalog/source-adapters.ts:73](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/native-input-catalog/source-adapters.ts#L73) — Adapter nie czyta import job..
- [app/src/backend/ingest/IngestRunner.ts:142](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/ingest/IngestRunner.ts#L142) — Validate/Decide/awaiting_review..

### G02 · P2 · Pełna agentowa ścieżka GHGI i fallbacki nie są dostępne

**planned-gap / code / względem baseline: still-valid.**

Brak agentowego create i osiągalnych manual/assisted/research/upload fallbacków oraz agentowego zapisu sektorów poza SE. Backend manual override już istnieje.

Granica dowodu: Dla obecnego czatu poprawnym wynikiem scenariusza jest uczciwy routing/odmowa, nie zmyślony sukces.
- [app/src/backend/agentic/ghgi/inventory/registry.ts:71](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/inventory/registry.ts#L71) — Query-only..
- [app/src/components/Cards/SectorCard.tsx:52](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/Cards/SectorCard.tsx#L52) — Agentic CTA only for stationary-energy.
- [climate-advisor/service/app/tools/stationary_energy_review_tools.py:731](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/tools/stationary_energy_review_tools.py#L731) — Tool pack bez manual/upload/research..
- [app/src/backend/agentic/ghgi/stationary-energy/registry.ts:105](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/registry.ts#L105) — Manual backend istnieje..

### G03 · P2 · Brak narzędzi publish, CDP i restore

**planned-gap / code / względem baseline: still-valid.**

W obecnym toolset nie ma tych komend z wymaganym potwierdzeniem.

Granica dowodu: Planowany zakres, nie dowód zepsutej istniejącej funkcji.
- [app/src/backend/agentic/ghgi/inventory/registry.ts:71](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/inventory/registry.ts#L71) — Query-only..
- [app/src/components/Cards/SectorCard.tsx:52](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/Cards/SectorCard.tsx#L52) — Agentic CTA only for stationary-energy.
- [climate-advisor/service/app/tools/stationary_energy_review_tools.py:731](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/tools/stationary_energy_review_tools.py#L731) — Tool pack bez manual/upload/research..
- [app/src/backend/agentic/ghgi/stationary-energy/registry.ts:105](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/registry.ts#L105) — Manual backend istnieje..

### G04 · P2 · Potwierdzenia SE nie mają wspólnego wiązania preview i wersji decyzji

**planned-gap / code / względem baseline: still-valid.**

Są własne karty i staging CA, ale brak wspólnej immutable pending action/preflight-confirm-result i pełnego podglądu wierszy/wartości na karcie save. Toolset nadal jest składany ręcznie.

Granica dowodu: Product commit nadal wymaga kliknięcia UI. Nie wykazano zapisu produktu bez potwierdzenia.
- [app/src/backend/agentic/ghgi/stationary-energy/registry.ts:48](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/ghgi/stationary-energy/registry.ts#L48) — Metadane confirmation/scope/schema..
- [climate-advisor/service/app/services/agent_service.py:369](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L369) — Ręczna kompozycja..
- [app/src/backend/agentic/native-input-catalog/registry.ts:28](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/backend/agentic/native-input-catalog/registry.ts#L28) — Finite common registry odczytów..
- [app/src/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations.ts:62](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/app/src/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations.ts#L62) — UI confirm→save..

### V01 · P2 · Scenariusze live i backtest na answer keys pozostają niewykonane

**verification-gap / not-run / względem baseline: unverified.**

GE/UW/PV/DA/ST nie zostały zmierzone na modelu. Potrzebne są seed stagingu, wykonanie scenariuszy i identyfikowalny zestaw CC-951 z answer keys dla backtestu CC-950.

Granica dowodu: Nie znaleziono zestawu w sprawdzonym kodzie/odczytanych ticketach; nie twierdzimy, że nie istnieje nigdzie.
- [docs/testing/cc-962-rescan-2026-11-01/baseline-10-scenarios-2026-10-26.md:1](baseline-10-scenarios-2026-10-26.md) — Dokument definiuje scenariusze..
- [climate-advisor/k8s/deployment-test.yml:30](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/k8s/deployment-test.yml#L30) — MLFLOW_ENABLED=true w repo..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:130](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L130) — Draft.trace_id=request ID..
- [climate-advisor/service/app/middleware/request_context.py:13](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/middleware/request_context.py#L13) — Nagłówek albo UUID..

### V02 · P2 · Wdrożony MLflow i korelacja identyfikatorów nie zostały odczytane

**verification-gap / not-run / względem baseline: unverified.**

Dziewięć lokalnych testów wykonało realny eksport/readback MLflow SQLite/artifacts. Wdrożona konfiguracja i powiązanie draft/request ID z MLflow trace ID wymagają osobnej próby.

Granica dowodu: Lokalny eksport nie dowodzi działania konkretnego dev/test/prod ani poprawnego tagowania pre-run (F10).

Dowód rodzica: [root-auth-observability-pytest.log](root-auth-observability-pytest.log).
- [docs/testing/cc-962-rescan-2026-11-01/baseline-10-scenarios-2026-10-26.md:1](baseline-10-scenarios-2026-10-26.md) — Dokument definiuje scenariusze..
- [climate-advisor/k8s/deployment-test.yml:30](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/k8s/deployment-test.yml#L30) — MLFLOW_ENABLED=true w repo..
- [climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:130](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py#L130) — Draft.trace_id=request ID..
- [climate-advisor/service/app/middleware/request_context.py:13](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/middleware/request_context.py#L13) — Nagłówek albo UUID..

### V03 · P2 · Dwie nowe hipotezy wymagają osobnych prób

**verification-gap / not-run / względem baseline: new.**

Do odtworzenia: równoległe saves mogą oba wykonać commit; po revoke chat właściciela może nadal ładować zapisany snapshot CA. Odczyt snapshotu wymaga też doprecyzowania polityki retencji/uprawnień.

Granica dowodu: Nie uznano za potwierdzone bugi. F16 z trzeciej hipotezy został odrębnie potwierdzony lokalnie.

### F14 · P3 · Narzędzia katalogu pojawiają się na powierzchni SE poza jej promptem

**verification-gap / conditional / względem baseline: new.**

Przy odpowiednim context/token narzędzia native_input są dodawane również w SE. Trzeba ustalić, czy jest to zamierzony zakres, i pokryć faktyczny zestaw narzędzi testem.

Granica dowodu: Brak dowodu nieuprawnionego dostępu lub niepoprawnej odpowiedzi live; pozostaje pytaniem o kontrakt powierzchni.
- [climate-advisor/service/app/services/agent_service.py:369](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/services/agent_service.py#L369) — Catalog tools are always extended.
- [climate-advisor/service/app/utils/streaming_context.py:274](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/app/utils/streaming_context.py#L274) — Catalog context is built for any authenticated request.
- [climate-advisor/service/tests/test_stationary_energy_pre_run_chat.py:208](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9/climate-advisor/service/tests/test_stationary_energy_pre_run_chat.py#L208) — Test has no catalog context.