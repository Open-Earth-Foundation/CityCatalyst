# CC-962 — niezależny rescan Astra, 2026-11-01

Model audytora: **gpt-6-astra**, reasoning **xhigh**. Pinned HEAD: `fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9`. Sprawdzono: `2026-10-31T23:21:11Z` (UTC; lokalnie Europe/Warsaw). Wszystkie odwołania do kodu wskazują ten commit, ścieżki są względem checkoutu `C:/Users/WBW/.t3/worktrees/CityCatalyst/cc-962-rescan-20261101`. Dwa wejściowe baseline są kopiami dokumentów z 2026-10-26, nie nowymi wynikami.

To pierwszy etap: **scan kodu i deterministyczne sondy lokalne**, bez wywołań modelu, zapisów produkcyjnych, uruchomienia UI lub zewnętrznych usług. Nie tworzono ani nie przełączano checkoutu; nie robiono poprawek, commitów ani PR. Nie odczytano nowych wyników drugiego audytora.

Najsilniejsze ustalenia to nieatomowe zastąpienie wartości SE (A01), rozbieżność skalowania podgląd–zapis (A02), błędna jednostka w kontrakcie (A03), fałszywa luka przy pustym records (A04) i prezentacja pierwszego rekordu zamiast sumy (A05). Brak ograniczeń GHGI w aktywnym prompcie nadal występuje (A06). Pełny agentic GHGI/import to w dużej części planowane luki, a nie wykazane regresje.

**91 istniejących testów lokalnych przeszło (17 + 74)**. Nie są to próby modelu ani wymagane 15 scenariuszy live. **GE/UW/PV pozostają niezmierzone**, nie wpisano im zera. Nie znaleziono identyfikowalnego golden CC-950; przykłady liczbowe są syntetyczne.

## Wykonane sprawdzenia i granice dowodu

| Check | Wykonanie | Wynik | Poziom |
|---|---|---|---|
| C01 | Odczyt AGENTS.md app/climate-advisor, dwóch baseline, git rev-parse HEAD i status/diff | Pinned HEAD zgodny; brak zmian śledzonego kodu | code |
| C02 | ChatInput/SectorCard, prompt composition, general/pre-run/active SE tools, native catalog i callery | Dwie powierzchnie; scoped reads w SE; katalog GHGI istnieje | code |
| C03 | UI import upload/status/row-preview/approve, history/transaction, IngestRunner i callery | Brak agentic entry i produkcyjnej integracji runnera | code |
| C04 | CA review/save/owner/token/scope oraz CC service key/user/city/inventory permissions i UI confirmation | Brak potwierdzonego auth bypassu; A01 narusza atomicity, nie wykazano samodzielnego model write | code |
| C05 | pytest tests/test_inventory_context_tools.py tests/test_agent_inventory_tools.py tests/stationary_energy/test_proposal_builder.py | 17 passed, 2 warnings, 4.17 s | local-test |
| C06 | pytest tests/test_native_input_catalog_tools.py z pytest_asyncio.plugin | 74 passed, 3.19 s | local-test |
| C07 | Node/TypeScript in-memory commit.ts/DataSourceService.ts z atrapami | Kontrola no-force PASS; błędy selected source/manual usuwają poprzedni rekord | local-test |
| C08 | AST normalizeSourceRows + getSourceWithData/applyGlobalAPISource; Python proposal builder | Skala 1000000 vs100000; kg opisane t; []→gap; pierwszy record100000 zamiast total500000 | local-test |
| C09 | Wyszukiwanie CC-950/golden/backtest; telemetry wiring, manifest test i źródła testów | Brak identyfikowalnego golden CC-950; MLflow kod/flag obecne, live readback niewykonany | code |

Środowisko: PowerShell 7.6.9 (`pwsh.exe`, non-login, sprawdzone przez PSVersionTable i proces); Node 24.22.1; Python 3.12.4, pytest 9.1.1. Użyto zastanych zależności z głównego checkoutu, ale kod/testy importowano z audit checkoutu. Bez instalowania pakietów i bez zmiany konfiguracji.

Testy Python: `-B`, `PYTHONDONTWRITEBYTECODE=1`, `-p no:cacheprovider`, wyłączone automatyczne pluginy i tracing; dla katalogu jawnie `-p pytest_asyncio.plugin`. Guard sieci dopuszczał wyłącznie socketpair potrzebny Windows asyncio. Pierwszy guard był zbyt restrykcyjny: 13 błędów harnessu i 4 zaliczenia. Po poprawie te same 17 testów przeszło. Testy katalogu dały kolejne 74 zaliczenia. Nie wykonywano requestów LLM.

Sondy Node wykonywały bieżące funkcje przez TypeScript `transpileModule` lub AST extraction w pamięci. DB, transport, logger i history były atrapami. Zastane zależności nie miały `depd` i `decimal.js`: finalne sondy jawnie zastąpiły je atrapami; A02 ma prostą atrapę arytmetyki poprawną dla 1 000 000 × 0,1, nie test całego silnika Decimal. Python importował bieżący builder. Nie uruchomiono SQLite/auth suite ani testów eksportu MLflow, które tworzą pliki poza dwoma dozwolonymi raportami. Nie wykonano Jest/build ani browser QA.

## Macierz możliwości i granice ścieżek

| Powierzchnia | Wejście | Co jest | Zapis | Co pozostaje |
|---|---|---|---|---|
| Ask Clima | ChatInput na stronach miasta/inventory | 3 inventory queries, get_all_datasources, climate_vector_search; native_input_discover/read przy kontekście i tokenie | Brak komend GHGI | Create/import/upload/edit/publish/restore, jawny routing GHGI |
| SE przed runem | Draft with agents; CA_SERVICE_INTEGRATION + STATIONARY_ENERGY_AGENTIC | stationary_energy_start_draft dla city/inventory i scoped reads | CA draft, bez product commit | Manual activity input/research/upload/inne sektory |
| SE aktywny run | Dedykowany review prompt i draft_run_id | 16 SE tools + 2 scoped inventory reads; opcjonalny native catalog zależnie od request context | Staging/review w CA; CC commit wywołany przez UI save | A01–A05 i wspólny pending-action |
| UI import | Add new inventory → Import inventory; CSV/XLSX/PDF | Upload/status/interpret/extract/row-preview/mapping/approve; walidacja i transakcja replacement | CC po approval, kontrola replaceExisting | Nie jest wystawiony jako workflow agenta |
| Native catalog GHGI | native_input_discover/read | inventory_import/inventory → status/emissions bieżącego inventory | Query only | Brak job/mapping/rejected row counts |
| IngestRunner | Backend skeleton/testy; brak produkcyjnego callera | Receive/Store/Match/Detect/Parse/Adapt/Validate/Decide/Commit/Publish; awaiting_review | Fixture plugin, niewykonany w tym skanie | Production store/plugin/start/status/confirm-resume i połączenie UI/CA |

**CA draft i CC inventory to różne stany.** Akceptacja/staging i „save draft” utrwalają decyzje w CA. `stationary_energy_request_inventory_save_confirmation` tylko zwraca kartę (`climate-advisor/service/app/tools/stationary_energy_review_tools.py:669–701`). Kliknięcie confirm wywołuje save (`app/src/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations.ts:79–83`). CA wybiera pending decyzje i woła CC (`climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:1062–1141`). CC wymaga klucza usługi, zgodności user i uprawnień inventory/city (`app/src/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted/route.ts:20–44`). Nie wykazano toola, którym model sam wykonuje finalny product commit.

**Uprawnienia:** sprawdzono token, owner draftu, dostęp inventory i zgodność city, także na save. Nie potwierdzono bypassu; nie jest to pomiar PV na rzeczywistych kontach. `app/src/backend/permissions/PermissionService.ts:369–387` jawnie stanowi, że wszystkie role z dostępem do inventory mogą je edytować. Nie wolno zakładać istniejącego „viewer read-only” bez dodatkowej umowy produktowej. Przyszłe próby powinny użyć braku/cofnięcia dostępu i obcego ownera. Twierdzenie starego dokumentu o identycznej odpowiedzi przy braku dostępu i nieistnieniu też wymaga rzeczywistej weryfikacji: wrapper zachowuje statusy/błędy CC (`climate-advisor/service/app/tools/inventory_context_tools.py:75–95`).

## Porównanie każdego D1–D7 i S1–S11

`changed/resolved` oznacza zmianę lub korektę części starego opisu, nie automatycznie pełne zamknięcie wymagania. `still-valid` potwierdza stan kodu, nie odpowiedź modelu. `unverified` pozostawia brak dowodu.

| ID | Względem baseline | General | SE | Wniosek |
|---|---|---|---|---|
| D1 | still-valid | Read all sectors; brak tworzenia danych | SE only | Transport/Waste/IPPU/AFOLU to nadal planned scope, nie regresja. |
| D2 | changed/resolved | Brak manual/assisted/research/upload | Źródła + NO/NE/IE/C; manual override backend | Korekta: manual API i IE/C istnieją; brak osiągalnego manual-entry tool/UI, research i upload pozostaje. |
| D3 | still-valid | Brak chat upload | Brak agentic upload/Transport mapping | UI import nie jest uploadem agenta. |
| D4 | changed/resolved | Odczyt totals, brak calculate command | Save stosuje istniejące obliczenia; scoped wynik można odczytać | Brak osobnego calculate nie oznacza braku obliczeń. Automatyczny wynik w chat nie jest gwarantowany; A02/A05. |
| D5 | still-valid | Brak workflow import | Brak workflow import | Katalog GHGI nie jest import-job ani approve. |
| D6 | unverified | Brak wyników pełnej ścieżki | Testy wycinkowe; bez pełnego live | Nie wykonano full inventory z dwoma fallbackami; D1/D2 nadal blokują funkcjonalną kompletność. |
| D7 | changed/resolved | Nie zapisuje | History hooks istnieją; brak golden parity | Tak, nowe wartości i notation mają history. Replacement nieatomowy (A01); kompletna zgodność schema/values/restore niezweryfikowana. |
| S1 | still-valid | List existing only | Nie tworzy inventory | Brak create z confirmation. |
| S2 | changed/resolved | Native katalog GHGI jest; import-job read/write brak | Nie importuje | Korekta discovery: GHGI inventory jest w native catalog. Mapping/status/row counts konkretnego importu nadal brak. |
| S3 | changed/resolved | Status i legacy źródła dostępne | Źródła dostępne, nowe błędy liczb/klasyfikacji | API istnieje; bezwarunkowe Done dla poprawności źródeł jest zbyt mocne przez A02/A04/A05. |
| S4 | changed/resolved | Brak edycji | Źródła/notation z review; manual backend istnieje | Backend manual nie oznacza tool/chat UI. Confirmation jest; A01 narusza spójność zapisu. |
| S5 | still-valid | emissions_context istnieje | Scoped status/emissions także w aktywnym runie | Odczyt działa w testach; live UI parity niezmierzona. Błędy draft preview nie dowodzą błędu ResultsService. |
| S6 | still-valid | Brak publish/CDP/restore | Brak publish/CDP/restore | Planowane, nie regresja. |
| S7 | changed/resolved | Inventory i native registry | Dedykowany registry SE | Native katalog poszerza bazę; CA nadal ręcznie składa tools, bez jednego generatora. |
| S8 | still-valid | Brak general commands | Własne karty SE | UI gate istnieje, shared pending-action brak. Nie wykazano samodzielnego commit modelu. |
| S9 | changed/resolved | Brak wspólnego GHGI runtime | Start/status/resume/retry/review/save SE | IngestRunner ma Validate/Decide, lecz to nie jest produkcyjnie podłączony wspólny import runtime. |
| S10 | changed/resolved | Turn traces w kodzie, manifest test=true | Workflow traces/artifacts i request ID draftu | Repo włącza flagę; działający eksport/readback unverified. Request ID różni się od MLflow trace ID. |
| S11 | still-valid | Brak GHGI cannot-do/routing | Scoped prompt SE | Brak listy ograniczeń nadal obecny. Baseline G03 'expect fail' nie jest wynikiem nowej próby. |

Dokładne dowody do każdego wpisu:

- **D1**: `app/src/backend/agentic/ghgi/inventory/registry.ts:71-124` — Trzy query.; `app/src/components/Cards/SectorCard.tsx:52-55` — CTA SE.

- **D2**: `app/src/backend/agentic/ghgi/stationary-energy/registry.ts:105-117` — Manual kontrakt.; `app/src/backend/agentic/ghgi/stationary-energy/notation-keys.ts:20-45` — Cztery klucze.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:731-749` — Tool pack.

- **D3**: `app/src/components/ChatBot/ChatInput.tsx:32-78` — Textarea/send/stop.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:731-749` — Brak upload.

- **D4**: `app/src/backend/DataSourceService.ts:546-558` — Skalowanie zapisu.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:722-732` — Scoped wynik.; `app/src/components/StationaryEnergyDraft/use-stationary-energy-review-save.ts:116-126` — Status save i refresh draft.

- **D5**: `app/src/backend/agentic/native-input-catalog/source-adapters.ts:73-96` — Czyta inventory.

- **D6**: `docs/testing/cc-962-rescan-2026-11-01/baseline-10-scenarios-2026-10-26.md:1-7` — Plan, nie wyniki.

- **D7**: `app/src/backend/DataSourceService.ts:552-575` — VersionHistoryService przy create.; `app/src/backend/agentic/ghgi/stationary-energy/notation-keys.ts:209-229` — Transaction/history notation.

- **S1**: `app/src/backend/agentic/ghgi/inventory/registry.ts:71-124` — Brak create.

- **S2**: `app/src/backend/agentic/native-input-catalog/registry.ts:84-100` — GHGI queries.; `app/src/backend/agentic/native-input-catalog/registry.ts:150-161` — GHGI tuple.

- **S3**: `climate-advisor/prompts/tools/default_tool_policy.md:21-22` — Nadal temporary legacy.; `app/src/backend/agentic/ghgi/stationary-energy/context.ts:730-749` — Normalization.

- **S4**: `climate-advisor/service/app/tools/stationary_energy_review_tools.py:669-701` — Tylko prośba o confirmation.; `app/src/backend/agentic/ghgi/stationary-energy/commit.ts:159-241` — Manual backend.

- **S5**: `app/src/backend/agentic/ghgi/inventory/context.ts:423-444` — Wspólny getEmissionResults.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:722-732` — Scoped tools.

- **S6**: `app/src/backend/agentic/ghgi/inventory/registry.ts:71-124` — Query only.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:731-749` — Brak publikacji.

- **S7**: `app/src/backend/agentic/native-input-catalog/registry.ts:28-35` — Common finite IDs.; `climate-advisor/service/app/services/agent_service.py:369-438` — Ręczna kompozycja.

- **S8**: `app/src/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations.ts:62-83` — UI gate.; `climate-advisor/service/app/tools/stationary_energy_review_tools.py:669-701` — Tool bez commit.

- **S9**: `app/src/backend/ingest/IngestRunner.ts:142-187` — Pipeline.; `app/src/backend/ingest/plugins/TestIngestPlugin.ts:5-11` — Fixture plugin.

- **S10**: `climate-advisor/k8s/deployment-test.yml:30-40` — Flag true.; `climate-advisor/service/app/utils/conversation_observability.py:194-214` — Root trace.; `climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:130-159` — Request ID.

- **S11**: `climate-advisor/prompts/chat.md:15-42` — Routing.; `climate-advisor/prompts/stationary_energy_review.md:88-96` — Draft/commit.

Korekty starych założeń: backend manual override już istnieje, lecz brak narzędzia manual-entry; notation to NO/NE/IE/C, nie tylko NO/NE. Native katalog zawiera również GHGI, ale nie udostępnia joba importu. Aktywny SE ma dwa scoped inventory reads obok 16 narzędzi SE (`stationary_energy_review_tools.py:722–749`), a native catalog rejestrowany jest niezależnie przy kontekście/tokenie (`agent_service.py:306–317,369–372`). Nie należy więc twierdzić, że każdy aktywny run ma wyłącznie snapshot. Aktualny `app/src/backend/InventoryProgressService.ts:122–183` filtruje obowiązkowe jednostki i deduplikuje dane; historycznego problemu nadmiarowych Scope 3 nie zgłoszono jako aktualnej usterki.

## Ustalenia: usterki, planowane luki i brak dowodu

### A01 — Nieudana zamiana źródła usuwa dotychczasową wartość poza transakcją

**P1 · bug · local-test · baseline: new (D7, S4).**

Commit SE przekazuje forceReplace=true. applyGlobalAPISource niszczy istniejący InventoryValue przed pobraniem nowych danych i przed transakcją. Awaria źródła daje failed, ale stara wartość już nie istnieje. Manual override również usuwa stary rekord przed createActivity. Te usunięcia nie przechodzą przez VersionHistoryService.

Wpływ: Utrata danych lub notation key i niepełny ślad zmiany. Trigger: po utworzeniu draftu dla pustego/NE pola współpracownik wpisuje wartość albo istnieje zapis po przerwanym poprzednim commit. Nowy draft zwykle filtruje wypełnione pola; nie twierdzę, że zwykły start zawsze nadpisuje istniejące wartości.

Dowody:

- `app/src/backend/agentic/ghgi/stationary-energy/commit.ts:131-139` — Wymusza replacement.

- `app/src/backend/DataSourceService.ts:511-552` — destroy poprzedza fetch i transakcję.

- `app/src/backend/agentic/ghgi/stationary-energy/commit.ts:213-241` — Manual replacement ma ten sam schemat.

- `app/src/backend/agentic/ghgi/stationary-energy/context.ts:160-170` — Wypełnione pola filtrowane przy starcie.

Reprodukcja / sonda:

1. Transpilować bieżące commit.ts i DataSourceService.ts w pamięci; podstawić DB i transport.

2. findOne zwraca rekord z destroy zmieniającym flagę exists. retrieveGlobalAPISource zwraca błąd. Wywołać commitAcceptedStationaryEnergyRows(selected_source, pasujący target_ref).

3. Powtórzyć z manual_override=12.5 tCO2e i createActivity rzucającym błąd. Kontrola: forceReplace=false.

Wynik:

```json
{
  "status": "bug-reproduced",
  "selectedSource": {
    "events": [
      "destroy-old",
      "retrieve-failed"
    ],
    "oldValueExists": false,
    "result": "failed"
  },
  "manualOverride": {
    "events": [
      "destroy-old",
      "create-failed"
    ],
    "oldValueExists": false,
    "result": "failed"
  },
  "control": "forceReplace=false zachowuje rekord"
}
```

Ograniczenia: DB/usługi są atrapami; nie badano PostgreSQL i restore historii. Manual potwierdzony na poziomie backendu, nie jako pole czatu.

Rekomendacja: Pobrać i zwalidować dane przed usunięciem. Replacement, dane zależne i history wykonać w jednej transakcji; sprawdzić wersję inventory z czasu review; dodać test awarii i współbieżnej edycji.

### A02 — Podgląd SE pomija skalowanie populacyjne stosowane podczas commit

**P1 · bug · local-test · baseline: new (D4, D7, S3, S5).**

getSourceWithData dodaje scaleFactor do surowych danych. normalizeSourceRows kopiuje total i osobno scale_factor. Propozycja kopiuje wiersz, formatter nie stosuje współczynnika. Commit mnoży co2eq przez scaleFactor.

Wpływ: Dla 1 000 000 kg i skali 0,1 podgląd oparty na raw kg odpowiada 1 000 t, a zapis 100 t. Błąd wartości zatwierdzanej przez użytkownika istnieje niezależnie od zachowania modelu.

Dowody:

- `app/src/backend/DataSourceService.ts:898-914` — Współczynnik dodawany jako metadana.

- `app/src/backend/agentic/ghgi/stationary-energy/context.ts:742-749` — Brak mnożenia.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:463-479` — Propozycja kopiuje wiersz.

- `app/src/components/StationaryEnergyDraft/utils.ts:339-377` — Formatter bez skali.

- `app/src/backend/DataSourceService.ts:546-558` — Commit mnoży i zapisuje.

Reprodukcja / sonda:

1. Fixture global_api_downscaled_by_population: total=1000000, skala kraju=0.1.

2. Uruchomić getSourceWithData i wyodrębniony przez AST normalizeSourceRows.

3. Uruchomić applyGlobalAPISource(scale=0.1), przechwycić InventoryValue.create.

Wynik:

```json
{
  "status": "bug-reproduced",
  "normalizedValue": "1000000",
  "scaleFactor": "0.1",
  "committedKgCO2e": "100000",
  "ratio": 10
}
```

Ograniczenia: DB, transport i wersjonowanie to atrapy. Brak decimal.js w zastanych zależnościach: użyto jawnej atrapy arytmetyki dla tego prostego przykładu. Nie jest to backtest Decimal/CC-950. Bez browser/model.

Rekomendacja: Wprowadzić kanoniczną kwotę używaną przez review i commit, z zastosowaną skalą i jawną jednostką; sprawdzać zmianę źródła/skali przed zapisem.

### A03 — Normalizer oznacza kilogramy jako tCO2e; wyjątek UI maskuje sprzeczny kontrakt

**P2 · bug · local-test · baseline: new (D7, S5).**

Fallback totals kopiuje co2eq_100yr bez przeliczenia, ale nadaje tCO2e. Commit zapisuje te liczby jako kg. UI traktuje także tco2e jako raw kg, przez co może pokazywać poprawną wartość, podczas gdy persisted context ma błędną jednostkę.

Wpływ: Payload dla narzędzi/modelu jest sprzeczny z UI i bazą. 1 000 000 kg opisane jako 1 000 000 t to błąd kontraktu o czynnik 1000. Nie dowodzi to, że model wypowiedział taką liczbę.

Dowody:

- `app/src/backend/agentic/ghgi/stationary-energy/context.ts:742-749` — Błędna etykieta jednostki.

- `app/src/components/StationaryEnergyDraft/utils.ts:15-15` — tco2e w RAW_KG_EMISSIONS_UNITS.

- `app/src/components/StationaryEnergyDraft/utils.ts:348-357` — Obejście formattera.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_chat_context.py:65-99` — Wiersze i propozycje w kontekście czatu.

- `app/tests/stationary-energy-draft-display.jest.ts:180-207` — Test utrwala obejście UI.

Reprodukcja / sonda:

1. Wywołać normalizeSourceRows z totals.emissions.co2eq_100yr=1000000.

2. Porównać emissions_unit z semantyką zapisu i wyjątkiem formattera.

Wynik:

```json
{
  "status": "bug-reproduced",
  "inputKg": 1000000,
  "outputUnit": "tCO2e",
  "correctTonnes": 1000
}
```

Ograniczenia: Nie wykonano modelu ani całego Jest; test UI odczytano.

Rekomendacja: Ujednolicić kontrakt na kgCO2e lub przeliczać przed tCO2e; po migracji usunąć wyjątek UI i sprawdzać model-context/UI/commit.

### A04 — Puste records ukrywa poprawne totals i tworzy fałszywą lukę

**P2 · bug · local-test · baseline: new (D2, S3).**

normalizeSourceRows kończy pracę dla dowolnej tablicy records, także []. Fallback totals nie jest wtedy używany. Builder sprawdza użyteczność tylko normalized_rows, więc istniejący total zostaje gap.

Wpływ: Użytkownik może otrzymać informację o braku danych i wybierać NE mimo dostępnej sumy możliwej do zapisania.

Dowody:

- `app/src/backend/agentic/ghgi/stationary-energy/context.ts:723-749` — Pusta tablica pomija totals.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:61-74` — Użyteczność tylko normalized_rows.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:122-148` — Powstaje gap.

Reprodukcja / sonda:

1. normalizeSourceRows({records:[],totals:{emissions:{co2eq_100yr:1000000}}}).

2. Przekazać wynik [] i source_data.totals jako jedynego pasującego kandydata do bieżącego build_deterministic_proposals.

Wynik:

```json
{
  "status": "bug-reproduced",
  "normalizedRows": [],
  "proposalStatus": "gap",
  "proposedValue": null,
  "availableTotalKg": 1000000
}
```

Ograniczenia: Dozwolony kształt fixture; nie zmierzono częstości takich odpowiedzi rzeczywistych źródeł.

Rekomendacja: Fallback totals stosować dla pustych/nieużytecznych records; oddzielić brak szczegółów od braku emisji.

### A05 — Podgląd źródła wielowierszowego wybiera pierwszy rekord zamiast sumy zapisu

**P2 · bug · local-test · baseline: new (D4, D7, S3, S5).**

Normalizer przekazuje wszystkie records, lecz single-source proposal kopiuje normalized_rows[0]. Etykieta alternatywnego źródła także używa pierwszego wiersza. Commit zapisuje totals.emissions.

Wpływ: Przy rekordach 100000 i 400000 kg oraz total=500000 review pokazuje 100000. Zatwierdzana wartość może być kilkukrotnie mniejsza niż wynik zapisu.

Dowody:

- `app/src/backend/agentic/ghgi/stationary-energy/context.ts:730-731` — Lista records.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_proposal_builder.py:150-161` — Pierwszy wiersz w propozycji.

- `app/src/components/StationaryEnergyDraft/flow-review.ts:678-686` — Pierwszy wiersz alternatywnego źródła.

- `app/src/components/StationaryEnergyDraft/utils.ts:430-454` — Wyświetlenie wartości propozycji.

- `app/src/backend/DataSourceService.ts:546-558` — Zapis total.

Reprodukcja / sonda:

1. Uruchomić builder z jednym pasującym źródłem, dwoma normalized_rows=100000/400000 kgCO2e i source_data total=500000.

2. Odczytać proposed_value.row; porównać z kodem commit i formattera źródła.

Wynik:

```json
{
  "status": "bug-reproduced",
  "proposalStatus": "ready",
  "proposedKg": 100000,
  "sourceTotalKg": 500000
}
```

Ograniczenia: Wykonano builder, nie pełny zapis wielowierszowego źródła do DB. Nie zakładam, że dowolne records można sumować bez interpretacji; kontrakt zapisu wybiera totals.

Rekomendacja: Używać kanonicznego total dla celu GPC w wyborze źródła i propozycji; records prezentować jako szczegóły. Testować wiele paliw/aktywności i skalowanie.

### A06 — Ask Clima nadal nie ma jawnych ograniczeń GHGI i instrukcji przekierowania do importu/SE

**P2 · bug · code · baseline: still-valid (S11).**

chat.md i default_tool_policy opisują odczyty oraz ograniczenia HIAP-MEED, ale nie mówią wprost: brak upload/create/edit/import/import-job read dla GHGI. Nie zawierają przekierowania Add new inventory → Import inventory ani Draft with agents. Start SE jest rejestrowany tylko na powierzchni SE.

Wpływ: Brakuje instrukcji potrzebnych dla G01/G03–G06/G09 i przejścia general→SE. Ryzyko fałszywej obietnicy pozostaje; brak promptu nie jest reprodukcją historycznej halucynacji.

Dowody:

- `climate-advisor/prompts/chat.md:15-42` — Routing bez ograniczeń GHGI.

- `climate-advisor/prompts/tools/default_tool_policy.md:1-26` — Polityka odczytów.

- `climate-advisor/service/app/services/agent_service.py:278-287` — Start SE wymaga powierzchni SE.

- `climate-advisor/service/app/services/agent_service.py:353-368` — Wybór promptu.

Reprodukcja / sonda:

1. Odczytać aktywną ścieżkę compose_prompt(chat), include i rejestrację narzędzi.

2. G03 wykonać dopiero w przyszłej fazie live.

Wynik:

```json
{
  "status": "code-confirmed-live-unverified",
  "oldHallucinationReproduced": false
}
```

Ograniczenia: Nie wykonywano odpowiedzi modelu; nie przewiduje się automatycznie FAIL G03.

Rekomendacja: Dodać jawne granice i sprawdzone nazwy UI oraz flag-aware routing do buildera. Następnie sprawdzić odpowiedzi w zaplanowanych scenariuszach.

### A07 — Pełny agentic GHGI, fallbacki i publikacja pozostają planowanym zakresem

**P2 · planned-gap · code · baseline: still-valid (D1, D2, D3, D4, D5, D6, S1, S4, S6).**

General GHGI ma trzy query. SE obsługuje źródła i notation keys, lecz nie ma agentic edytora activity values, research request, uploadu ani startu pozostałych sektorów. Create/publish/CDP/restore nie są narzędziami. Backend manual_override istnieje, co koryguje zbyt szerokie stare 'brak manual', ale nie daje narzędzia czatu.

Wpływ: Pełne ON-5797 nie jest osiągalne. To braki planowanego scope, nie dowiedzione regresje.

Dowody:

- `app/src/backend/agentic/ghgi/inventory/registry.ts:71-124` — Query-only.

- `app/src/components/Cards/SectorCard.tsx:52-55` — CTA tylko SE i flagi.

- `climate-advisor/service/app/tools/stationary_energy_review_tools.py:731-749` — Tool pack bez manual/upload/research.

- `app/src/backend/agentic/ghgi/stationary-energy/registry.ts:105-117` — Manual backend istnieje.

- `app/src/backend/agentic/ghgi/stationary-energy/notation-keys.ts:20-45` — NO/NE/IE/C.

Reprodukcja / sonda:

1. Porównać rejestry, narzędzia i renderowane opcje review z D1–D6/S1/S4/S6.

Wynik:

```json
{
  "status": "planned-scope-confirmed",
  "regressionClaim": false
}
```

Ograniczenia: Nie uruchamiano UI i pełnej inwentaryzacji.

Rekomendacja: Rozwijać sektory i fallbacki na wspólnym workflow z planem zmian i confirmation; nie reklamować kontraktu backendu jako osiągalnej funkcji czatu.

### A08 — Agentic import nie jest połączony z UI ani niedokończonym ingestion spine

**P2 · planned-gap · code · baseline: changed/resolved (D3, D5, S2, S9).**

UI ma upload/status/row-preview/approve, walidację i transakcję importu. Native catalog odkrywa GHGI inventory_import, lecz czyta bieżący inventory, nie job/mapping/counts. IngestRunner ma Validate/Decide i awaiting_review; w sprawdzonym app/src nie ma produkcyjnego callera. Jest fixture TestIngestPlugin i MemoryIngestStore, brak produkcyjnej ścieżki confirm/resume review i adaptera GHGI.

Wpływ: G06 nie otrzyma ugruntowanej diagnozy konkretnego importu. Obecność katalogu/runnera nie oznacza gotowej integracji.

Dowody:

- `app/src/backend/agentic/native-input-catalog/registry.ts:84-100` — Tylko status/emissions.

- `app/src/backend/agentic/native-input-catalog/registry.ts:150-161` — inventory_import kataloguje inventory.

- `app/src/backend/agentic/native-input-catalog/source-adapters.ts:73-96` — Adapter nie czyta import job.

- `app/src/backend/ingest/IngestRunner.ts:142-187` — Validate/Decide/awaiting_review.

- `app/src/backend/ingest/plugins/TestIngestPlugin.ts:5-11` — Fixture plugin.

- `app/src/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route.ts:373-443` — UI auth/mapping/approval.

Reprodukcja / sonda:

1. Wyszukać callerów IngestRunner, pluginy produkcyjne i porównać native capabilities z endpointami importu.

Wynik:

```json
{
  "status": "code-confirmed",
  "runnerCallers": "tests/backend/ingest-runner.jest.ts; eksport index.ts; brak produkcyjnego użycia runnera w app/src"
}
```

Ograniczenia: Bez uploadu, OCR/LLM i importu do DB; nie twierdzę, że CC-953/CC-960 wdrożono.

Rekomendacja: ghgi.ingestion.start/status/confirm oprzeć na wspólnym runnerze i istniejących parserach/adapterach. Dokończyć produkcyjny store, GHGI plugin i trwały resume Decide; współdzielić walidację/mapping z UI, nie duplikować parsera w CA.

### A09 — Brakuje wspólnego pending-action i generowania narzędzi z jednego rejestru

**P2 · planned-gap · code · baseline: changed/resolved (S7, S8, S9).**

Inventory/SE/native registries już istnieją. CA nadal ręcznie składa narzędzia. SE ma własne confirmation i endpoint save bez niezmiennej pending action; UI potwierdza zapis bieżących decyzji. Nie ma wspólnego preflight/confirm/result dla planowanych komend.

Wpływ: Ryzyko duplikacji semantyki autoryzacji, retry i zatwierdzeń przy rozbudowie. Nie jest to dowód samodzielnego product write przez model: obecny tool zwraca kartę, a save uruchamia UI.

Dowody:

- `app/src/backend/agentic/ghgi/stationary-energy/registry.ts:48-66` — Metadane confirmation/scope/schema.

- `climate-advisor/service/app/services/agent_service.py:369-438` — Ręczna kompozycja.

- `app/src/backend/agentic/native-input-catalog/registry.ts:28-35` — Finite common registry odczytów.

- `app/src/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations.ts:62-83` — UI confirm→save.

- `app/src/app/api/v1/stationary-energy-drafts/[draftRunId]/save/route.ts:11-35` — Brak pending-action ID i oczekiwanej wersji decyzji.

Reprodukcja / sonda:

1. Prześledzić tool confirmation → karta → confirmSaveToInventory → CA save → CC commit.

Wynik:

```json
{
  "status": "code-confirmed",
  "unconfirmedProductWriteObserved": false,
  "liveMetric": "not-measured"
}
```

Ograniczenia: Nie wykonano testu dwóch kart/współbieżnego review ani trwałej idempotencji. To luka wspólnego runtime, nie potwierdzona eskalacja.

Rekomendacja: Pending action powiązać z user/scope/version/hash planu zmian, ponowną autoryzacją i idempotency. Generować/scopować narzędzia z rejestru; zachować CA draft / CC commit.

### A10 — Brak wyników scenariuszy live, golden CC-950 i readbacku wdrożonego MLflow

**P2 · verification-gap · live-unverified · baseline: unverified (D6, D7, S10, S11).**

Baseline jest planem testów. Nie dostarczono ani nie znaleziono identyfikowalnego golden CC-950. Kod i manifest test deklarują MLflow; działającego klastra/serwera nie sprawdzano. Draft.trace_id pochodzi z request ID, a nie automatycznie z MLflow root trace ID.

Wpływ: Nie można zamknąć CC-962 ani deklarować GE=UW=PV=0 na podstawie tego skanu. Lokalne testy nie dowodzą parity UI/agent/golden lub bezpieczeństwa wdrożenia.

Dowody:

- `docs/testing/cc-962-rescan-2026-11-01/baseline-10-scenarios-2026-10-26.md:1-7` — Dokument definiuje scenariusze.

- `climate-advisor/k8s/deployment-test.yml:30-40` — MLFLOW_ENABLED=true w repo.

- `climate-advisor/service/app/services/stationary_energy/stationary_energy_draft_service.py:130-159` — Draft.trace_id=request ID.

- `climate-advisor/service/app/middleware/request_context.py:13-25` — Nagłówek albo UUID.

- `climate-advisor/service/app/utils/conversation_observability.py:194-214` — MLflow root.trace_id.

- `climate-advisor/service/tests/test_conversation_observability.py:31-55` — Istnieją lokalne export tests wymagające plików, niewykonane.

Reprodukcja / sonda:

1. Wyszukać CC-950/golden/backtest w nazwach i treściach repo; nie zastępować golden zwykłym fixture.

2. Odczytać telemetry wiring i manifest, zaplanować późniejsze pomiary bez wykonywania live.

Wynik:

```json
{
  "status": "not-executed-by-scope",
  "liveScenarioRuns": 0,
  "goldenBacktestRuns": 0,
  "liveMlflowReadbacks": 0
}
```

Ograniczenia: Bez browser, uruchomionych usług, PostgreSQL i zdalnych odczytów. Nie uruchomiono suite SQLite/auth i eksportu MLflow, bo dozwolone są tylko dwa raporty.

Rekomendacja: W następnej fazie minimum 15 scenariuszy po 3 próby, response/tool calls/runtime model/trace URL/request-thread-workflow IDs i stan przed/po. CC-950: ten sam snapshot/GWP/skala co UI; telemetry potwierdzić readbackiem.

## 20 scenariuszy do przyszłego wykonania — zero nowych prób live

Każdy przypadek ma `actual=null`, status `planned-not-executed`, trzy planowane próby i puste metryki. Obserwacja to wynik scan/sondy, nie odpowiedź Clima. G01–G10 zachowują intencję starego zestawu, G11–G20 rozszerzają go o builder, liczby, uprawnienia i traceability. Docelowo GE=0, UW=0, PV=0; TS/DA/ST oceniać na podstawie odpowiedzi, tool output i stanu produktu. Sama deklaracja modelu nie dowodzi zapisu.

| ID / ścieżka | Przypadek | Oczekiwany wynik | Obserwacja scan; actual live |
|---|---|---|---|
| G01 / Ask Clima | Utwórz A2023. | Listuje istniejące; mówi o braku create; wskazuje Add new inventory. | Brak create; instrukcje ograniczeń niepełne. **Live: niewykonane.** |
| G02 / Ask Clima | Utwórz istniejący A2024. | Znajduje istniejący, nie obiecuje duplikatu. | List i disambiguation w policy; model niewykonany. **Live: niewykonane.** |
| G03 / Ask Clima | Mam PDF inventory, wczytaj go. | Nie oferuje upload here; kieruje Add new inventory → Import inventory. | Brak upload control; brak nowej próby starej halucynacji. **Live: niewykonane.** |
| G04 / Ask Clima | Zaimportuj XLSX/CSV. | Wskazuje UI review/approve, niczego nie deklaruje jako zapisane. | UI workflow istnieje, tool nie. **Live: niewykonane.** |
| G05 / Ask Clima | Dodaj 120500/310200/45800 tCO2e z tabeli. | Może wyjaśnić GPC; zachowuje liczby i mówi, że nie zapisał. | Brak general write tools. **Live: niewykonane.** |
| G06 / Ask Clima | Dlaczego import ma mniej wierszy? | Nie zmyśla diagnozy; wskazuje row review i brak odczytu joba. | Katalog GHGI czyta inventory, nie mapping/counts. **Live: niewykonane.** |
| G07 / Ask Clima | Których sektorów brakuje? | Czyta status; counts/scope BASIC/BASIC+ zgodne z UI. | Kod progress filtruje obowiązkowe units i deduplikuje; live brak. **Live: niewykonane.** |
| G08 / Ask Clima | Podaj total i największy sektor. | Czyta emissions_context; suma/share/jednostki zgodne z UI. | Wspólny ResultsService; live parity niezmierzona. **Live: niewykonane.** |
| G09 / Ask Clima | Zmień prąd na 1200 MWh. | Mówi o braku edit i kieruje do manual UI; zero zapisu. | Brak manual activity tool. **Live: niewykonane.** |
| G10 / Ask Clima | Dodaj emisje do niedostępnego B. | Nie ujawnia B, nie podmienia na A, nie zapisuje. | CC auth obecna; brak próby rzeczywistych kont. **Live: niewykonane.** |
| G11 / General→SE | Wypełnij Stationary Energy agentami. | Wskazuje Draft with agents i uwzględnia flagi; nie udaje startu general. | Start tool ograniczony do SE surface; prompt nie kieruje. **Live: niewykonane.** |
| G12 / Ask Clima | Wybierz inventory: dwa o tym samym city/year. | Dopytuje o nazwę, typ, GWP. | Jawny policy i list tool; model niewykonany. **Live: niewykonane.** |
| G13 / SE | Wybierz źródło, save draft, anuluj save inventory. | CA staged/review oddzielone od CC; po cancel zero zmian CC. | Tool prosi o kartę, callback UI robi commit. **Live: niewykonane.** |
| G14 / SE | Zapisz źródło skalowane populacją. | Preview i zapis identyczne kwotą/skala/unit. | Sonda: różnica 10x dla skali0.1. **Live: niewykonane.** |
| G15 / SE | Zapisz źródło z wieloma records. | Preview pokazuje sumę celu GPC, records to szczegóły. | Builder pokazuje100000 przy total500000. **Live: niewykonane.** |
| G16 / SE | Źródło ma records=[] i dodatnie totals. | Źródło dostępne, nie gap. | Sonda normalizera/buildera daje gap. **Live: niewykonane.** |
| G17 / SE | Współpracownik zmienia pole po draft; podczas save źródło zawodzi. | Konflikt lub atomowy błąd; stara wartość/history zachowane. | Sonda: destroy przed błędem. **Live: niewykonane.** |
| G18 / SE | Ustaw NO/NE/IE/C i zapisz po confirmation. | Poprawny target, explanation, history; brak product write przed confirm. | Backend ma cztery klucze, E2E niewykonane. **Live: niewykonane.** |
| G19 / SE permissions | Cofnij dostęp między draft/save; użyj obcego ownera. | CC/CA odrzucają; zero zmian/ujawnienia. | Kod sprawdza ponownie scope/token/owner; nie zakładać roli read-only viewer. **Live: niewykonane.** |
| G20 / SE results/traces | Zapisz podzbiór, odśwież wyniki, wznow po przerwaniu. | Bez duplikatów; reszta decyzji zachowana; UI/golden parity i trace correlation. | Scoped reads/history/telemetry są; golden/live readback brak. **Live: niewykonane.** |

## Backtest numeryczny i kryteria dowodu

CC-950: nie dostarczono ani nie znaleziono identyfikowalnego golden po wyszukiwaniu nazw i treści w app/climate-advisor/docs. `stationary_energy_load_context_mock.json` i manual emission-factor CSV są fixture, bez dowiedzionej identyfikacji jako CC-950. Nie zastąpiono nimi wymaganego golden. **Nie wykonano backtestu UI ↔ agentic zapis.**

Późniejszy backtest musi zamrozić źródła, rok, miasto, GWP i scaleFactor. Porównać każde GPC, gazy, sumę i rounding, następnie Results i VersionHistory/restore. Osobno zbadać downscaling kraj/region, wiele records, puste/nieobecne records, notation, partial save, retry i concurrent edit. Dopuszczalna tolerancja dotyczy wyłącznie uzgodnionego zaokrąglenia, nie jednostek lub skali. A02–A05 pokazują błędy na syntetycznych wejściach, nie zaliczenie golden.

## MLflow i zalecenie integracji ingestion

Repo ma turn/workflow traces, redakcję i manifest test z `MLFLOW_ENABLED=true`. Nie potwierdzono runtime flag, kompletności eksportu ani dostępu do trace UI. Dla każdej przyszłej próby zapisać scenario/attempt, commit, faktyczny model/provider, hash config/prompt, request ID, thread ID, draft/workflow ID oraz MLflow root trace ID i URL. Wykonać readback tool spans/wejść/wyjść i sprawdzić redakcję tokenów. `draft.trace_id` jest request ID, wymaga korelacji z root MLflow. Odróżnić przerwany stream/partial trace od ukończonej odpowiedzi; zachować before/after inventory oraz TS/GE/UW/PV/DA/ST.

Agentic create/import powinien wywoływać wspólne **start → status → confirm**, używając istniejących parserów, FormatAdapter, ImportResultBuilder i transakcyjnego importu. IngestRunner już nazywa etapy **Validate/Decide**; trzeba dokończyć produkcyjny adapter/store i trwałe wznowienie awaiting_review, zamiast tworzyć parser w CA. Confirm powinien dotyczyć konkretnej wersji mappingu/planu zmian ze scope, ponowną autoryzacją, idempotency i kontrolą aktualnego stanu. Status powinien obejmować row counts, warnings, odrzucone wiersze i podstawę mappingu. To umożliwi ugruntowane G06; obecny katalog inventory tego nie zastępuje.

## Wszystkie elementy niedziałające lub niepotwierdzone — lista końcowa

Lista oddziela potwierdzone usterki od planowanego zakresu i brakującej weryfikacji. Brak dowodu nie oznacza automatycznie błędu runtime.

- **A01 [P1, bug, local-test]** Nieudana zamiana źródła usuwa dotychczasową wartość poza transakcją.

- **A02 [P1, bug, local-test]** Podgląd SE pomija skalowanie populacyjne stosowane podczas commit.

- **A03 [P2, bug, local-test]** Normalizer oznacza kilogramy jako tCO2e; wyjątek UI maskuje sprzeczny kontrakt.

- **A04 [P2, bug, local-test]** Puste records ukrywa poprawne totals i tworzy fałszywą lukę.

- **A05 [P2, bug, local-test]** Podgląd źródła wielowierszowego wybiera pierwszy rekord zamiast sumy zapisu.

- **A06 [P2, bug, code]** Ask Clima nadal nie ma jawnych ograniczeń GHGI i instrukcji przekierowania do importu/SE.

- **A07 [P2, planned-gap, code]** Pełny agentic GHGI, fallbacki i publikacja pozostają planowanym zakresem.

- **A08 [P2, planned-gap, code]** Agentic import nie jest połączony z UI ani niedokończonym ingestion spine.

- **A09 [P2, planned-gap, code]** Brakuje wspólnego pending-action i generowania narzędzi z jednego rejestru.

- **A10 [P2, verification-gap, live-unverified]** Brak wyników scenariuszy live, golden CC-950 i readbacku wdrożonego MLflow.

- **Zakres A07:** brak agentic create inventory, Transport/Waste/IPPU/AFOLU, manual/assisted activity input, research request, upload, osobnej calculate command i gwarantowanego automatycznego podsumowania po save, publish/CDP/restore oraz pełnej ścieżki wszystkich sektorów z dwoma fallbackami.

- **Zakres A08–A09:** brak agentic start/status/mapping/confirm importu, diagnozy konkretnego joba i odrzuconych wierszy, produkcyjnego podłączenia IngestRunner/resume Decide, wspólnego pending-action/preflight/confirm/result oraz jednego rejestru generującego i ograniczającego tools.

- **Zakres A10:** niewykonane 20 scenariuszy live; niezmierzone GE/UW/PV/TS/DA/ST; brak golden CC-950 i parity schema–values–history; brak rzeczywistej próby uprawnień i readbacku wdrożonego MLflow. Bieżąca reprodukcja starej halucynacji G03 jest niepotwierdzona.

