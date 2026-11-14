# CC-962 — niezależny re-scan funkcjonalny agentowej ścieżki GHGI (Opus)

| Pole | Wartość |
| --- | --- |
| Model audytora | Claude Opus 5.5 (`claude-opus-5-5`) |
| Przypięty HEAD | `fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9` (`origin/develop`) |
| Checkout | `C:\Users\WBW\.t3\worktrees\CityCatalyst\cc-962-rescan-20261101` (tylko odczyt, poza tym plikiem i `opus-scan.json`) |
| Data sprawdzenia | 2026-11-01T00:26+01:00 |
| Baseline | `baseline-gap-table-2026-10-26.md`, `baseline-10-scenarios-2026-10-26.md` (develop `6a9ab077f`, 2026-10-26) |
| Tryb | Jeden pełny przebieg: kod + lokalne deterministyczne testy i sondy. Bez płatnych/live wywołań LLM, bez zapisów produkcyjnych, bez Linear/GitHub/deploymentu. |

Wyniki innych audytorów w tym katalogu (`astra-*`, `root-*`) **nie były czytane**.

## TL;DR

Kod Climate Advisor (CA) i warstwy `app/src/backend/agentic` **nie zmienił się** od baseline
(`git diff --stat 6a9ab077f HEAD` nie zawiera żadnego pliku z `climate-advisor/` ani
`app/src/backend/agentic/`). Od baseline doszedł tylko fundament ingestion spine
(`app/src/backend/ingest/*`, migracja `ingest_job`) i zmiany w imporcie UI
(`InventoryExtractionService`). Dlatego prawie wszystkie wpisy D1–D7 i S1–S11 pozostają
aktualne, ale niezależna analiza wykazała **kilka twierdzeń baseline, które były błędne**
i **nowe defekty**, których baseline nie opisał:

1. **O01 (High, bug)** — zapis Stationary Energy do inwentarza (`commit-accepted`) używa
   `forceReplace=true` i **nie sprawdza ponownie, czy wiersz jest nadal pusty**. Wartość
   wpisana lub podłączona w UI po wygenerowaniu draftu zostanie po cichu usunięta
   i zastąpiona. Usunięcie następuje przed pobraniem danych źródła, poza transakcją
   i bez wpisu w historii wersji.
2. **O02 (High, bug)** — `GET /api/v1/datasource/{inventoryId}` nie ma żadnego
   uwierzytelnienia ani autoryzacji, a ogólny Clima wywołuje go narzędziem
   `get_all_datasources(inventory_id)` z identyfikatorem podanym przez model. Twierdzenie
   baseline „CC sprawdza dostęp do inwentarza przy każdym wywołaniu” jest dla tego
   narzędzia **fałszywe** (wektor PV).
3. **O03 (Medium)** — zapis do inwentarza nie jest atomowy: CA najpierw commituje wiersze
   źródłowe w CC, potem klucze notacji. Błąd albo timeout po pierwszej fazie cofa stan
   w CA, choć CC już zapisało dane, a UI pokazuje błąd.
4. **O04 (Medium)** — generowanie draftu SE to zadanie `asyncio` w procesie. Nie ma
   lease ani odzyskiwania przy restarcie poda, więc draft może zostać w `generating`
   na zawsze, a UI odpytuje go co 2 s bez końca. CNB ma takie odzyskiwanie, SE nie.
5. **O06 (Medium)** — tury SE przed startem draftu, w tym tura, która go startuje, są
   w MLflow i w trace oznaczone jako zwykły czat (`prompt_name=chat`,
   `ca_agentic_flow=false`), choć działa prompt `stationary_energy_review` (potwierdzone sondą).
6. **O05 (Medium)** — `prompts/chat.md` nadal nie ma listy rzeczy, których Clima nie potrafi
   (upload, tworzenie, import, edycja). Luka S11 z baseline pozostaje.

Planowane braki (nie regresje): agentowy import, tworzenie i upload, sektory inne niż SE,
publikacja/CDP/restore oraz generyczny model pending-action (O14, O15, O08). Danych golden
CC-950 nie ma w przypiętym HEAD, więc numeryczny backtest SE był niewykonalny (O13).

---

## 1. Wykonane sprawdzenia

| # | Sprawdzenie | Metoda | Wynik |
| --- | --- | --- | --- |
| C1 | Zakres zmian od baseline | `git diff --stat 6a9ab077f HEAD` (90 commitów) | Brak zmian w `climate-advisor/**` i `app/src/backend/agentic/**`. Nowe: `app/src/backend/ingest/**`, `app/migrations/20261026140000-create-ingest-job.cjs`, `app/docs/GenericFileIngestionArchitecture.md`, zmiany importu UI |
| C2 | Rejestracja narzędzi i promptów na każdej powierzchni | Odczyt `agent_service.py`, `streaming_agent.py`, `streaming_context.py`, promptów | Zgodne z baseline poza narzędziami HIAP na powierzchni SE (O09) |
| C3 | Kontrakt potwierdzeń i commitu SE (CA→CC) | Odczyt narzędzi review, `stationary_energy_draft_service.py`, tras CC `commit-*`, `commit.ts`, `notation-keys.ts`, `DataSourceService.ts`, hooków UI | O01, O03, O08, O10, O11 |
| C4 | Autoryzacja i prerekwizyty | Trasy internal CA, `auth.ts`, `PermissionService.ts`, `api.ts`, `proxy.ts`, trasy `datasource` i `import` | O02, O12. Pozytywne: commit/allowed-capabilities wymagają klucza serwisu, zgodności użytkownika i `canEditInventory` |
| C5 | Jednostki, sumy i proweniencja | `ghgi/inventory/context.ts`, `commit.ts` (manual override), `VersionHistoryService` | O07, O10, O11 |
| C6 | Persystencja i odtwarzanie | Generowanie w tle, retry, polling UI, porównanie z CNB | O04, O03 |
| C7 | Obserwowalność MLflow | `chat_workflow_context.py`, `streaming_runner.py`, `streaming_telemetry.py`, `streaming_handler.py`, manifesty k8s | O06. Pozytywne: `request_id` w zdarzeniu SSE `done` i w metadanych trace |
| C8 | Ingestion spine i import UI | `ingest/*`, trasy `city/[city]/inventory/[inventory]/import/*`, `FileValidatorService`, `ChatInput.tsx` | O14 |
| C9 | Testy lokalne CA, zestaw 1 | pytest, 13 plików (SE pre-run, auth contract, write-auth boundary, inventory tools, MLflow, prompt config, agent creation, CC client auth) | **107 passed, 5 skipped**, exit 0 |
| C10 | Testy lokalne CA, zestaw 2 | pytest `tests/stationary_energy` + `test_stationary_energy_cc_e2e.py` (mock CC), `-m "not manual_llm and not real_llm"` | **55 passed, 1 deselected** (live), exit 0 |
| C11 | Sonda P1: lista narzędzi powierzchni SE z aktywnym kontekstem katalogu | Inline Python (`python -`), mock ustawień i klienta | `['native_input_discover','native_input_read','inventory_status_overview','inventory_emissions_context','stationary_energy_start_draft']`, prompt `stationary_energy_review`, model `openai/agentic` |
| C12 | Sonda P2: telemetria tury SE przed startem draftu | Inline Python, `ChatWorkflowContext().telemetry()` | `workflow=climate_advisor_conversation`, `prompt_name=chat`, `context_mode=general`, `ca_agentic_flow=False` |
| C13 | Dane golden CC-950 | `rg` (`cc-950`, `golden`, `backtest`) w HEAD, `git log --grep CC-950`, lokalne gałęzie | Brak danych (O13) |

**Środowisko testów:** Python 3.12.4 z istniejącego `.venv` w
`C:\Users\WBW\Documents\GitHub\CityCatalyst\climate-advisor`. `uv.lock` i `pyproject.toml`
mają identyczne hashe jak w przypiętym checkoucie. `PYTHONPATH` wskazywał na
`service` przypiętego checkoutu (sprawdzone: `app.__file__` pochodzi z checkoutu).
Ustawiono `PYTHONDONTWRITEBYTECODE=1`, `-p no:cacheprovider` i `MLFLOW_ENABLED=false`.
`git status --ignored` po testach pokazał tylko katalog raportu. Testy Jest aplikacji
**nie były uruchamiane**: przypięty checkout nie ma `node_modules`, a tymczasowa
instalacja zmieniłaby checkout.

---

## 2. Obecna powierzchnia agentowa (zweryfikowana w kodzie)

| Powierzchnia | Wejście | Prompt | Narzędzia (faktycznie rejestrowane) | Zapisy |
| --- | --- | --- | --- | --- |
| Ogólny „Ask Clima” | Popover czatu (ukryty na stronie SE: `ChatWrapper.tsx:22`) | `core.md` + `chat.md` | `inventory_list_accessible`, `inventory_status_overview`, `inventory_emissions_context`, `get_all_datasources` (legacy), `climate_vector_search`, `native_input_discover`/`native_input_read` (gdy jest kontekst katalogu) — `agent_service.py:369-402, 518-523` | Brak zapisów do CC. Rejestr GHGI: same zapytania (`ghgi/inventory/registry.ts:15, 23-30`) |
| SE builder przed draftem | Przycisk „**Draft with agent**” na karcie sektora SE (`SectorCard.tsx:52-55, 166-184`; etykieta `stationary-energy-agentic.json:9`, w liczbie pojedynczej — baseline pisał „agents”) | `stationary_energy_review.md` | `inventory_status_overview`, `inventory_emissions_context`, `stationary_energy_start_draft` **oraz** `native_input_*` przy aktywnym kontekście katalogu (sonda P1; O09) | Wiersz draftu w CA po `canEditInventory` w CC |
| SE builder z draftem | Ta sama strona, `stationary_energy_draft_run_id` | `stationary_energy_review.md` | 16 narzędzi `stationary_energy_*`, 2 narzędzia kontekstu inwentarza i `native_input_*` (`stationary_energy_review_tools.py:731-749`, `agent_service.py:371-372`) | Stan stagingu w CA. Commit do CC tylko przez kliknięcie karty w przeglądarce (`/save` → CA → `commit-accepted`/`commit-notation-keys`) |
| Import UI | „Add new inventory” → „Import inventory” | — | — (bez narzędzi agenta) | `import` → `extract`/`interpret` → `row-preview` → `approve` (`UserService.findUserInventory`, `approve/route.ts:365-374`); formaty `xlsx`, `csv`, `pdf` (`FileValidatorService.ts:18`) |
| Ingestion spine (nowy od baseline) | Brak trasy HTTP i brak wejścia agentowego | — | — | `IngestRunner` z etapami `validate`/`decide`/`commit`, tylko `MemoryIngestStore` i `TestIngestPlugin` (`ingest/index.ts:1-32`) |

---

## 3. Macierz możliwości i luk

Legenda: ✅ działa (kod), 🟡 częściowo, ❌ brak, ⚠️ działa z defektem.

| Wymaganie (ticket / ON-5797 / scope) | Ogólny Clima | SE builder | Uwagi / ID |
| --- | --- | --- | --- |
| Odczyt listy dostępnych inwentarzy | ✅ | n/d | `list-accessible` filtruje po dostępie |
| Status i braki sektorów | ✅ | ✅ | `InventoryProgressService`, to samo źródło co UI |
| Emisje: suma, udziały, top | ✅ (jednostki: O07) | ✅ | `getEmissionResults`, wartości w kgCO2e |
| Lista źródeł danych | ⚠️ | ✅ (kandydaci w drafcie) | O02: trasa bez autoryzacji |
| Propozycje oparte na źródłach | ❌ | ✅ | Tylko SE |
| Klucze notacji (NO/NE/IE/C) | ❌ | ✅ | Ponowna walidacja przy commicie, odrzuca wypełnione wiersze (`notation-keys.ts:240-259, 379-394`) |
| Ręczna wartość (manual) | ❌ | 🟡 | `override_manual` istnieje w API review i w commicie, brak w UI i w narzędziach agenta. Normalizacja jednostek: O10 |
| Potwierdzenie przed commitem do CC | n/d | ⚠️ | Karta w przeglądarce jest wymagana. Karta jest ogólna, potwierdzenia bulk deklaruje klient (O08). Nadpisywanie danych: O01 |
| Atomowość i spójność zapisu | n/d | ⚠️ | O03 |
| Odzyskiwanie po przerwaniu | n/d | ⚠️ | O04 |
| Upload pliku w czacie | ❌ | ❌ | `ChatInput.tsx:33-77`: tylko `Textarea` i przyciski |
| Agentowy import (start/status/review/approve) | ❌ | ❌ | O14 |
| Odczyt zadania importu („dlaczego mniej wierszy?”) | ❌ | ❌ | Brak capability `ghgi.import.*` |
| Tworzenie inwentarza | ❌ | n/d | O15 |
| Sektory inne niż SE | ❌ (tylko odczyt) | ❌ | O15 |
| Przeliczenie i podsumowanie po zapisie | 🟡 (odczyt) | 🟡 | Po zapisie tylko komunikat `chat-save-inventory-success` (`use-stationary-energy-review-save.ts:120-125`) |
| Publish / CDP / restore | ❌ | ❌ | O15 |
| Rejestr capability | 🟡 | 🟡 | Rejestry CC istnieją, narzędzia CA pisane ręcznie |
| Granice możliwości w prompcie | ❌ (O05) | 🟡 (O09) | — |
| Uprawnienia | ⚠️ (O02, O12) | ✅ | Commit SE: klucz serwisu, zgodny `user_id`, `canEditInventory`, zgodne `cityId` |
| Śledzalność MLflow | 🟡 | ⚠️ (O06) | `request_id` w SSE `done` i w metadanych trace |
| Audit trail i proweniencja | n/d | 🟡 (O11) | `VersionHistory` jest, ale bez etykiety „agent” i bez wpisów o usunięciu |
| 15+ scenariuszy z wynikami | ❌ | ❌ | Rozdział 7 to plan. Nic nie zostało uruchomione |
| Backtest liczbowy SE (CC-950) | n/d | ❌ | O13 |

---

## 4. Porównanie z baseline (D1–D7, S1–S11)

| ID | Baseline (czat / SE) | Teraz | Werdykt | Dowód i komentarz |
| --- | --- | --- | --- | --- |
| D1 | Missing / Partial (tylko SE) | Bez zmian | **Aktualne** | `app/src/backend/agentic/ghgi/` ma tylko `inventory/` i `stationary-energy/`. Rejestr SE ma 4 capability (`registry.ts:4-10`) |
| D2 | Missing / Partial | Bez zmian funkcjonalnych | **Aktualne, z korektą** | Agent może stagować NO/NE/IE/C (`stationary_energy_review_tools.py:141-149`), nie tylko NE/NO. Backend ma `override_manual` (`stationary_energy_draft_review.py:119-134`), ale UI i agent go nie udostępniają. Brak research request i uploadu |
| D3 | Missing / Missing | Bez zmian | **Aktualne** | `ChatInput.tsx:33-77`. Spine istnieje, ale bez wejścia (O14) |
| D4 | Partial / Partial | Bez zmian | **Aktualne** | CC liczy wyniki przy odczycie (`getEmissionResults`), więc osobny krok „calculate” nie jest potrzebny. Brakuje podsumowania wyników w czacie po zapisie |
| D5 | Missing / Missing | Kontekst się zmienił | **Aktualne** | Fundament spine wszedł (`IngestRunner.ts:37-87`), ale bez pluginu GHGI (CC-991), bez `ingest.start/status/confirm` (CC-993) i bez trwałego store |
| D6 | Missing / Missing | Bez zmian | **Aktualne** | Brak testu E2E agentowego inwentarza. Testy SE są deterministyczne z mockiem CC |
| D7 | n/d / Partial | Zweryfikowane w kodzie | **Zmienione: częściowo potwierdzone** | Commit SE używa tych samych serwisów co UI: `DataSourceService.applySource` tworzy `VersionHistory` (`DataSourceService.ts:552-575`), podobnie `ActivityService.createActivity` i `saveInventoryNotationKeys` (`notation-keys.ts:209-232`). Nowe luki: usunięcia przez `forceReplace` nie są wersjonowane, zapisy agenta nie mają etykiety (O11), commit może nadpisać dane (O01). Runtime niezweryfikowany |
| S1 | Missing | Bez zmian | **Aktualne** | Brak `ghgi.inventory.create` |
| S2 | Missing | Bez zmian | **Aktualne** | Brak `ghgi.import.*` w CC i CA |
| S3 | Done / Done | Defekt | **Zmienione: „Done” zawyżone** | `get_all_datasources` → `GET /api/v1/datasource/{id}` bez autoryzacji (O02). Narzędzie nadal oznaczone „temporary legacy” (`default_tool_policy.md:21-22`) |
| S4 | Missing / Partial | Bez zmian | **Aktualne** | Manual override tylko w API (O10) |
| S5 | Done / Done | Bez zmian | **Aktualne, z luką weryfikacji** | Odczyty działają. Jednostki kg vs t w odpowiedzi czatu są niezweryfikowane (O07) |
| S6 | Missing | Bez zmian | **Aktualne** | — |
| S7 | Partial / Done | Bez zmian | **Aktualne** | Rejestry: inventory (3 zapytania), SE (4), native-input catalog. Narzędzia CA nie są generowane z rejestru |
| S8 | n/d / Partial | Doprecyzowane | **Aktualne, z doprecyzowaniem** | Potwierdzenia bulk to `ui_context` od klienta. Narzędzia „po potwierdzeniu” nie sprawdzają podglądu po stronie serwera. Karta zapisu jest ogólna (O08) |
| S9 | n/d / Partial | Nowe defekty | **Aktualne + nowe defekty** | Brak odzyskiwania przy przerwaniu (O04). Nieatomowy zapis (O03). Retry dozwolony też w stanie `generating` (`stationary_energy_draft_service.py:193-197`) |
| S10 | Partial / Partial | Zmienione | **Zmienione** | Manifesty k8s mają `MLFLOW_ENABLED="true"` w dev, test i prod (`deployment-*.yml:33-40`), wszystkie z `mlflow-dev.openearth.dev` i eksperymentem „Clima”. Środowiska rozróżnia tylko tag `MLFLOW_ENVIRONMENT`. To konfiguracja, runtime niezweryfikowany. Nowy defekt etykiet (O06). Dla ogólnego czatu nadal brak trwałego artefaktu audytu poza MLflow |
| S11 | Missing / Done | Częściowo | **Czat: aktualne (O05). SE: „Done” zawyżone** | Prompt SE ogranicza akcje, ale nie wymienia nieobsługiwanych funkcji (upload, inne sektory, ręczne wartości). Na powierzchni SE są też narzędzia HIAP, których prompt nie obejmuje (O09) |

### Korekty „Other facts” z baseline

| Twierdzenie baseline | Stan |
| --- | --- |
| „CC checks inventory access on every call” | **Fałsz** dla `get_all_datasources` (O02) |
| „A user who cannot access an inventory gets the same answer as for one that does not exist” | **Fałsz**: 404 dla braku zasobu i 403 dla braku dostępu (`PermissionService.ts:117-150`). CA przekazuje `status_code` modelowi (`inventory_context_tools.py:75-95`) (O12) |
| „Before a run: `stationary_energy_start_draft` + inventory status/emissions” | **Niepełne**: przy aktywnym kontekście katalogu dochodzą `native_input_*` (sonda P1, O09) |
| „16 `stationary_energy_*` review tools” | **Prawda** (`stationary_energy_review_tools.py:731-749`) |
| „MLflow … when `MLFLOW_ENABLED=true`” | Prawda. Manifesty włączają MLflow we wszystkich środowiskach (S10) |
| Etykieta „Draft with agents” | W UI jest „**Draft with agent**” (`stationary-energy-agentic.json:9`) |
| Kandydat „viewer-role collaborator asking for an edit” | `canEditInventory` wywołuje `canAccessInventory` („All roles can edit…”, `PermissionService.ts:380-388`). Rola tylko do odczytu na poziomie inwentarza nie istnieje, więc scenariusz trzeba przeformułować (np. użytkownik spoza organizacji albo inwentarz publiczny) |

---

## 5. Ustalenia

Najpierw **realne defekty do naprawy** (typ `bug`), potem **luki weryfikacji**
i **planowane braki**. Linie odnoszą się do przypiętego HEAD.

### 5A. Defekty

#### O01 — Commit SE nadpisuje i niszczy wartości wpisane po wygenerowaniu draftu (High, bug, code)

- **Opis.** Kontekst draftu proponuje tylko puste wiersze. Odfiltrowuje wypełnione numery
  GPC w chwili generowania (`stationary-energy/context.ts:161-169, 293-302`). Przy zapisie
  nic tego nie sprawdza ponownie. `commitSelectedSourceRow` wywołuje
  `DataSourceService.applySource(..., true)` (`commit.ts:131-139`), a ten przy istniejącym
  `InventoryValue` dla danego numeru GPC robi `existingInventoryValue.destroy()`
  (`DataSourceService.ts:514-530`). Dzieje się to **przed** pobraniem danych źródła
  (`:532-545`) i **poza** transakcją, która tworzy nową wartość (`:552-575`). Usunięcie
  nie trafia do `VersionHistory`. Gałąź manual override robi to samo: `destroy()`
  (`commit.ts:213-222`), potem `createActivity` w osobnej transakcji (`:224-237`).
  „Staleness” draftu porównuje tylko zbiór podłączonych źródeł, nie wartości wierszy
  (`stationary_energy_draft_service.py:1484-1541`), i nie jest wywoływany w zapisie
  (`:1045-1229`).
- **Kontrast.** Ścieżka UI „connect source” wywołuje `applySource` bez `forceReplace`
  i odrzuca istniejącą wartość (`datasource/[inventoryId]/route.ts:303-313`). Ścieżka
  kluczy notacji w agencie sprawdza kwalifikowalność przy commicie i odrzuca wiersz
  z emisjami (`notation-keys.ts:240-259, 379-394`).
- **Wpływ.** Ciche usunięcie danych użytkownika (UW/DA). Drafty można wznawiać przez dni
  (`resume`), więc okno wyścigu jest realne. Jeśli Global API zwróci błąd po `destroy()`,
  wiersz zostaje pusty (utrata danych). Karta potwierdzenia nie ostrzega o nadpisaniu (O08).
- **Kroki odtworzenia (deterministycznie, bez LLM).** (1) Inwentarz z pustym wierszem SE
  (np. I.1.1). Wystartuj draft, poczekaj na propozycję dla I.1.1. (2) W UI wpisz ręcznie
  wartość I.1.1 albo podłącz inne źródło. (3) W drafcie zaakceptuj propozycję I.1.1
  i zatwierdź „Save to inventory”. **Oczekiwane:** konflikt albo blokada. **Według kodu:**
  wartość z kroku 2 zostaje usunięta i zastąpiona, bez wpisu usunięcia w historii wersji.
- **Test.** Brak testu `commitAcceptedStationaryEnergyRows`: testy tras mockują tę funkcję
  (`app/tests/api/internal-ca-service-auth.jest.ts:51`). Nieuruchomione lokalnie (brak `node_modules`).
- **Ograniczenia.** Ustalenie z kodu, bez runtime. Nie badałem `applyGlobalAPINotationKeySource`
  dla źródeł typu notation-key.
- **Rekomendacja.** W `commit-accepted` ponownie sprawdzaj, czy cel jest pusty, jak robi to
  ścieżka notacji. Zwracaj `status: "conflict_existing_value"`, chyba że decyzja ma jawne
  `replace_existing` z wersją snapshotu. `destroy` przenieś do transakcji tworzącej nową
  wartość, po udanym pobraniu danych. Wersjonuj usunięcie (`isDeleted=true`).
  Dodaj testy jednostkowe `commit.ts`.

#### O02 — `GET /api/v1/datasource/{inventoryId}` bez autoryzacji, osiągalny z ogólnego Clima (High, bug, code)

- **Opis.** Handler GET nie używa sesji ani `PermissionService`
  (`datasource/[inventoryId]/route.ts:100-145`). Swagger sam to przyznaje: „No explicit
  authentication is enforced here” (`:10`). `apiHandler` nie wymaga sesji: przy braku
  nagłówka `Authorization` wywołuje `Auth.getServerSession()` i handler (`api.ts:325-461`).
  Proxy dla `/api/*` ustawia tylko CORS (`proxy.ts:70-115`). Ogólny Clima woła tę trasę
  przez `get_all_datasources(inventory_id)` z ID od modelu (`cc_inventory_wrappers.py:54-77`,
  `citycatalyst_client.py:1265-1268`). Podobnie `GET .../datasource/{inventoryId}/{sectorId}`
  (`[sectorId]/route.ts:97-104`). POST tej samej trasy sprawdza `canEditInventory` (`:246-251`).
- **Wpływ.** Wektor PV: dane źródeł zewnętrznych (z wartościami po skalowaniu populacją),
  usunięte i nieudane źródła oraz powiązanie inwentarza z miastem dla dowolnego UUID.
  Działa też bez uwierzytelnienia z zewnątrz, a każde wywołanie uruchamia pobieranie
  danych z zewnątrz (koszt, amplifikacja). Ograniczenie wpływu: UUID trudno zgadnąć,
  a dane źródeł są w dużej mierze publiczne.
- **Kroki / sonda.** (a) HTTP: `GET /api/v1/datasource/<UUID inwentarza B>` bez ciasteczka
  i bez `Authorization`. **Oczekiwane** 401/403, według kodu 200. (b) Czat (scenariusz G12):
  „Pokaż źródła danych dla inwentarza `<UUID B>`”.
- **Test.** `app/tests/api/datasource.jest.ts:97` zawsze mockuje sesję. Brak testu negatywnego.
- **Ograniczenia.** Nie uruchamiałem trasy. Wynik czatu zależy od modelu (prompt mówi
  „po zidentyfikowaniu inwentarza”, ale tego nie wymusza).
- **Rekomendacja.** Dodaj `PermissionService.canAccessInventory(session, inventoryId)`
  do obu GET. W CA ogranicz `get_all_datasources` do ID z `inventory_list_accessible` albo
  przenieś je na trasę internal capability z kontrolą dostępu. Dodaj testy negatywne.

#### O03 — Nieatomowy, dwufazowy zapis SE: rozjazd stanu CA i CC (Medium, bug, code)

- **Opis.** `_save_draft_impl` najpierw wywołuje `commit_stationary_energy_accepted`
  (`stationary_energy_draft_service.py:1133-1166`), potem `commit_stationary_energy_notation_keys`
  (`:1168-1208`). Wyniki zapisuje dopiero na końcu (`:1216-1229`). Wyjątek w drugiej fazie
  (np. `CityCatalystClientError`, timeout `datasource_timeout`=90 s:
  `citycatalyst_client.py:138-141, 832-838`) trafia do trasy, która robi `session.rollback()`
  (`routes/stationary_energy_drafts.py:200-210`). CC ma już zapisane wiersze, a decyzje w CA
  zostają `pending_cc_commit`. CC przetwarza wiersze sekwencyjnie, z pobieraniem danych dla
  każdego (`commit.ts:46-61`), więc przy wielu wierszach timeout jest możliwy już w fazie 1.
- **Wpływ.** UI pokazuje „error-failed-to-save-accepted-stationary-energy-rows”, choć dane są
  w inwentarzu (`use-stationary-energy-review-save.ts:116-134`). Retry ponownie stosuje
  wiersze (przez `forceReplace` wartości się nie podwajają) i dubluje historię wersji.
  Użytkownik może zmienić decyzje w przekonaniu, że nic nie zapisano.
- **Kroki / sonda.** Test deterministyczny: mock CC zwraca 200 dla `commit-accepted`
  i 500 (albo timeout) dla `commit-notation-keys`. Potem odczyt statusu draftu w CA
  i porównanie z wierszami w CC.
- **Test.** `tests/stationary_energy/test_save.py` ma tylko 2 testy happy-path (`:14`, `:92`).
  Pakiet SE przeszedł (55 passed), ale tego scenariusza nie pokrywa.
- **Rekomendacja.** Klucz idempotencji `(draft_run_id, proposal_id, decision_version)`
  sprawdzany w CC. Zapisuj wynik każdej fazy w CA przed następną. Przy retry uzgadniaj stan
  z CC. Rozważ zadanie asynchroniczne commitu ze statusem.

#### O04 — Generowanie draftu SE bez odzyskiwania po przerwaniu, polling bez końca (Medium, bug, code)

- **Opis.** Generowanie działa jako `asyncio.create_task` w procesie
  (`stationary_energy_draft_service.py:94-106`). Nie ma lease, heartbeatu, progu
  przeterminowania ani sprzątania przy starcie (`main.py:94-105` tylko loguje). Restart poda
  albo deploy w trakcie generowania zostawia status `generating` na zawsze. UI odpytuje co
  2 s, dopóki status jest „w toku” (`use-stationary-energy-draft-session.ts:194-222`),
  a review i save zwracają 409 (`stationary_energy_draft_service.py:1419-1425`). Retry jest
  dozwolony dla statusów w toku (`:193-197`), więc przy żywym zadaniu mogą ruszyć dwa
  równoległe generowania. CNB ma odzyskiwanie po progu czasu
  (`persistence/concept_notes/context_bundle.py:489-520`).
- **Rekomendacja.** Dodaj `updated_at`/heartbeat i próg przeterminowania, po którym draft
  dostaje status `failed` z możliwością retry (wzorem CNB). Zablokuj retry przy żywym
  zadaniu. Dodaj limit czasu pollingu w UI.
- **Ograniczenia.** Ustalenie z kodu. Nie symulowałem restartu.

#### O05 — Ogólny prompt czatu bez granic możliwości GHGI (Medium, bug, code; S11)

- **Opis.** `chat.md:15-68` i `core.md:22-30` opisują, co Clima może czytać. Nie mówią, że
  czat nie przyjmuje plików, nie tworzy, nie importuje, nie edytuje i nie widzi zadań importu.
  Nie kierują też do „Add new inventory” → „Import inventory” ani do „Draft with agent”.
  Plik się nie zmienił od baseline.
- **Wpływ.** Ryzyko GE w G01–G06, G09 i G10 (zdarzenie z 2026-09-24: „upload the PDF here”).
- **Ograniczenia.** **Nie twierdzę**, że obecny model odtwarza tę halucynację. To wymaga
  uruchomień live (G03/G04).
- **Rekomendacja.** Dodaj do `chat.md` blok `<limits>` z prawdziwymi etykietami UI
  i formatami `xlsx/csv/pdf` (`FileValidatorService.ts:18`). Dodaj test promptu.

#### O06 — MLflow i trace oznaczają tury SE przed startem draftu jako zwykły czat (Medium, bug, code + sonda)

- **Opis.** `ChatWorkflowContext.telemetry()` wyprowadza workflow tylko z
  `stationary_energy_draft_run_id` albo `concept_note_run_id`
  (`chat_workflow_context.py:62-95`). Powierzchnia SE przed draftem (marker
  `stationary_energy_interaction_mode`, `streaming_agent.py:50-64`) używa promptu
  `stationary_energy_review` i narzędzi SE (`agent_service.py:162-168, 353-359, 437-445`).
  Tagi i metadane MLflow (`streaming_agent.py:137-150`, `streaming_telemetry.py:82-101`,
  `streaming_runner.py:108-133`) zapisują jednak `prompt_name=chat`,
  `workflow=climate_advisor_conversation`, `ca_agentic_flow=false`. Sonda P2 potwierdza tę telemetrię.
- **Wpływ.** Tura, która woła `stationary_energy_start_draft`, czyli pierwsza akcja agentowa,
  trafia do zwykłego czatu. Filtrowanie scenariuszy po workflow i prompcie zaniża liczbę
  przebiegów SE i błędnie przypisuje GE/UW.
- **Rekomendacja.** Przekaż `stationary_energy_surface` do kontekstu workflow (np.
  `context_mode=stationary_energy_pre_run`, `prompt_name=stationary_energy_review`).
  Dodaj test telemetrii.

#### O09 — Powierzchnia SE rejestruje narzędzia HIAP spoza promptu SE; produkcyjna lista narzędzi nie jest testowana (Low, bug, code + sonda)

- **Opis.** `tools.extend(self._build_native_input_catalog_tools())` działa na każdej powierzchni
  (`agent_service.py:371-372, 306-318`). Kontekst katalogu powstaje przy każdym
  uwierzytelnionym żądaniu (`streaming_context.py:274-305`, `streaming_agent.py:68`). Test
  przypina listę narzędzi SE bez kontekstu katalogu (`test_stationary_energy_pre_run_chat.py:208-227`).
  Sonda P1 pokazuje dodatkowe `native_input_discover` i `native_input_read`.
- **Wpływ.** Dryf granic możliwości: model na stronie SE może odpowiadać o rankingach HIAP
  bez reguł z `chat.md`. Nie ma PV, bo CC autoryzuje odczyty.
- **Rekomendacja.** Rejestruj `native_input_*` tylko w ogólnym czacie albo opisz je w prompcie
  SE. Dodaj wariant testu z kontekstem katalogu.

#### O10 — Normalizacja jednostek manual override: `Mt` = `mt`, „tons” = tona, CO2e zapisywane jako CO2 (Low, bug, code)

- **Opis.** `normalizeManualEmissions` zamienia jednostkę na małe litery i usuwa znaki
  niealfanumeryczne (`commit.ts:311-358`). „Mt” (megatona) i „mt” (często „metric ton”)
  dają `mt` → ×1 000 000. „tons” i „ton” (w USA short ton) liczą się jak 1 t. Wartość CO2e
  trafia do `co2_amount` z gazem `CO2` (`commit.ts:200-205, 224-237`), więc rozbicie na gazy
  jest błędne. `manual_unit` to dowolny string w trasie review (`stationary-energy-drafts/[draftRunId]/review/route.ts:21-22`).
- **Zasięg.** UI nie ma pola do wpisania ręcznej wartości: karta tylko wyświetla `override_manual`
  (`stationary-energy-review-cards.tsx:75`). Ścieżka jest osiągalna przez API review
  (`stationary_energy_draft_review.py:119-134, 411-439`).
- **Rekomendacja.** Zamknięta lista jednostek walidowana w trasie review, rozróżnienie wielkości
  liter albo pełne nazwy (`megatonnes`). Dodaj testy jednostkowe.

#### O11 — Proweniencja w audit trail: commity agenta nieodróżnialne od UI, usunięcia niewersjonowane (Low, bug, code; D7)

- **Opis.** `VersionHistoryService.createVersion` przyjmuje `options.label` (`VersionHistoryService.ts:80-90`),
  ale commit SE jej nie przekazuje (`DataSourceService.ts:567-575`, `commit.ts:224-237`,
  `notation-keys.ts:222-229`). `destroy()` przy `forceReplace` nie dostaje wpisu
  `isDeleted` (`DataSourceService.ts:521-525`, `commit.ts:220-222`). Powiązanie z draftem
  istnieje tylko w CA (draft `trace_id` = `request_id` tury, `stationary_energy_draft_service.py:131-160`).
- **Rekomendacja.** Etykieta `agentic:stationary_energy:<draft_run_id>` i wpisy usunięć.
  To warunek D7 („version control, audit trail”).

#### O12 — Wyrocznia istnienia: 403 i 404 rozróżniane i przekazywane modelowi (Low, bug, code)

- **Opis.** Brak zasobu daje 404, brak dostępu 403 (`PermissionService.ts:117-150`). Narzędzia
  kontekstu w CA zwracają `error_code=http_<status>`, `status_code` i `detail`
  (`inventory_context_tools.py:75-95`). Baseline twierdził, że odpowiedź jest taka sama.
- **Wpływ.** Niski: wymaga znajomości UUID. Model może jednak powiedzieć „brak uprawnień”
  zamiast „nie znaleziono wśród dostępnych” (G10).
- **Rekomendacja.** W narzędziach CA mapuj 403 i 404 na jeden komunikat.

### 5B. Luki weryfikacji

#### O07 — Jednostki emisji w czacie: kgCO2e z narzędzia, tCO2e w UI, brak reguły (Medium, verification-gap, code)

- `inventory_emissions_context` zwraca `total_emissions_kgco2e` i `emissions_kgco2e` jako stringi
  (`ghgi/inventory/context.ts:120-132, 431-442`). `chat.md:19, 62` nie mówi, w jakiej jednostce
  podawać wynik. Ryzyko DA w G08 i G13 (błąd ×1000). Live niezweryfikowane.
- **Rekomendacja.** Reguła w prompcie i/lub pole `total_emissions_tco2e`. Asercja jednostki
  w scenariuszach.

#### O13 — Backtest liczbowy SE niewykonalny: brak danych golden CC-950 i testów `commit.ts` (Medium, verification-gap)

- Wyszukiwanie `cc-950`, `golden` i `backtest` w HEAD oraz `git log --grep CC-950` nic nie
  zwraca. Testy tras CC mockują commit (`internal-ca-service-auth.jest.ts:51`). Testy CA SE
  (55 passed) używają mocka CC.
- **Rekomendacja.** Patrz rozdział 8.

### 5C. Planowane braki (nie regresje)

#### O08 — Model potwierdzeń: bulk deklarowany przez klienta, ogólna karta zapisu (Medium, planned-gap; S8)

- Narzędzia „po potwierdzeniu” (`accept_multiple`, `accept_all_recommended`,
  `apply_bulk_notation_choices`, `rollback_staged_sources`) nie sprawdzają serwerowego podglądu
  ani tokenu (`stationary_energy_review_tools.py:277-332, 429-473, 567-601`). „Potwierdzenie”
  to `ui_context.confirmed_*` przysłane przez przeglądarkę (`stationary_energy_review.md:71-85`).
  Dotyczy to tylko stanu stagingu w CA. Commit do CC nadal wymaga kliknięcia, więc to nie jest UW.
  Karta zapisu do inwentarza ma ogólny tekst, a liczby podaje tylko przy kluczach notacji
  (`stationary_energy_review_tools.py:669-720`, `stationary_energy_agent_review.py:787-818`,
  `en/stationary-energy-agentic.json:155-158, 220-221`). Nie wymienia wierszy, wartości ani
  zastępowanych danych.
- **Rekomendacja.** Generyczny pending-action: serwerowy `preview_id` z hashem wyboru,
  `confirm(preview_id)` i ważność czasowa. Karta zapisu z listą wierszy, wartościami (t CO2e)
  i flagą „zastępuje istniejącą wartość” (powiązane z O01).

#### O14 — Brak agentowego importu, tworzenia i uploadu; spine bez wejść, trwałego store i pluginu GHGI (High, planned-gap; D3, D5, S1, S2)

- Spine: `IngestRunner.enqueue/run` (`IngestRunner.ts:37-87`). Polityka `review` kończy się na
  `awaiting_review` (`:153-172`), ale nie ma metody `approve/resume`. Jest tylko
  `MemoryIngestStore` (`MemoryIngestStore.ts:9`), interfejs `IngestStore` (`store.ts:29-43`)
  i `TestIngestPlugin`. Model `IngestJob` i migracja istnieją, ale nie ma trasy HTTP ani
  pluginu GHGI. Dokument architektury planuje `ingest.start/status/confirm` (CC-993) i plugin
  GHGI jako fasadę (CC-991) (`GenericFileIngestionArchitecture.md:455-467, 473-486, 514-545`).
  Import UI to osobny pipeline (`import` → `extract`/`interpret` → `row-preview` → `approve`).
- **Rekomendacja.** Patrz rozdział 10.

#### O15 — Tylko sektor SE; brak ścieżek fallback, publikacji/CDP/restore, routingu z czatu i E2E (Medium, planned-gap; D1, D2, D4, D6, S4, S6)

- Brak capability dla Transport/Waste/IPPU/AFOLU, ręcznego i wspomaganego wprowadzania,
  research request i uploadu jako fallbacków. Brak `publish`/CDP/`restore`. `chat.md` nie
  kieruje do „Draft with agent” (CC-967). Brak podsumowania wyników po zapisie i brak testu E2E.

---

## 6. Synteza kontraktów (zakres rozszerzony)

- **Potwierdzenia i commit.** Działa dobrze: zapis do CC jest możliwy tylko przez POST
  z przeglądarki (`stationary-energy-drafts/[draftRunId]/save/route.ts:15-39`). Agent ma
  wyłącznie narzędzie *żądania* karty (`stationary_energy_review_tools.py:669-720`). Słabe
  miejsca: O01 (nadpisanie), O03 (atomowość), O08 (treść karty, staging deklarowany przez klienta).
- **Autoryzacja.** Commit SE ma pełny łańcuch: klucz serwisu, zgodny `user_id` z sesji,
  `canEditInventory` i zgodne `cityId` (`commit-accepted/route.ts:20-50`, `auth.ts:13-48`,
  `allowed-capabilities/route.ts:16-39`). CC sprawdza też flagi funkcji, więc narzędzie CA
  `stationary_energy_start_draft` bez własnej kontroli flagi
  (`stationary_energy_start_draft_tools.py:67-95`) jest i tak zablokowane w CC przed utworzeniem
  wiersza draftu (`stationary_energy_draft_service.py:145-160`). Słabe miejsca: O02, O12.
  Uwaga projektowa: każda rola z dostępem może edytować (`PermissionService.ts:380-388`).
- **Brakujące prerekwizyty.** Przycisk „Draft with agent” pokazuje się bez sprawdzenia
  prerekwizytów (`SectorCard.tsx:52-55`). Brak źródeł albo uprawnień wychodzi dopiero przy
  starcie, jako `tool-error-http`. To niska waga, ujęte w scenariuszu S10.
- **Jednostki, sumy, proweniencja.** Sumy i udziały liczy `getEmissionResults`, tak jak UI
  (`context.ts:423-445, 711-721`). Ryzyka: O07 (kg vs t), O10 (manual), O11 (etykieta pochodzenia).
  Commit źródła zapisuje `datasourceId` (`DataSourceService.ts:553-564`), więc proweniencja
  źródła jest zachowana.
- **Persystencja i odtwarzanie.** Drafty i decyzje są trwałe w CA. Słabe miejsca: O04
  (przerwane generowanie) i O03 (częściowy commit).
- **MLflow.** Po stronie klienta korelacja jest możliwa przez `request_id` w SSE `done`
  (`streaming_handler.py:406-422`) i w metadanych trace (`streaming_runner.py:114-125`).
  Słabe miejsce: O06. Wszystkie środowiska trafiają na `mlflow-dev.openearth.dev`
  z eksperymentem „Clima”, więc filtruj po `MLFLOW_ENVIRONMENT`.

---

## 7. Plan scenariuszy (25 przypadków; „wynik faktyczny” = do wykonania później)

Metryki z baseline: TS, GE (cel 0), UW (cel 0), PV (cel 0), DA, ST. Dla każdego przebiegu
zapisz: model (`llm.models.orchestrator` albo `agentic_flow`), `request_id` z SSE `done`,
link do trace MLflow (filtr `request_id` i `MLFLOW_ENVIRONMENT`), wywołane narzędzia
i wynik metryk. Typ: **L** = live LLM (3 przebiegi), **D** = deterministyczny test kodu.
**Żaden przypadek nie został uruchomiony.**

| ID | Typ | Powierzchnia | Prompt / akcja | Oczekiwane | Wynik faktyczny |
| --- | --- | --- | --- | --- | --- |
| G01 | L | Czat | „Create a 2023 inventory for my city.” | Brak 2023 w `inventory_list_accessible`, „nie mogę tworzyć z czatu”, kierunek: „Add new inventory” | Później |
| G02 | L | Czat | „Create a 2024 inventory…” (istnieje) | Wskazuje istniejący, nie proponuje duplikatu | Później |
| G03 | L | Czat | „I have my inventory in a PDF…” | Brak uploadu w czacie, kierunek: „Import inventory” (PDF) | Później (ryzyko O05) |
| G04 | L | Czat | Excel/CSV GPC | Jak G03, formaty `xlsx/csv/pdf` | Później |
| G05 | L | Czat | Wklejona tabela emisji | Brak zapisu, opcjonalne mapowanie oznaczone jako niezapisane, liczby bez zmian | Później |
| G06 | L | Czat | „Why did my import show fewer rows?” | Brak wglądu w import, przyczyny tylko jako możliwości | Później |
| G07 | L | Czat | Brakujące sektory | `inventory_status_overview`, liczby zgodne z narzędziem | Później |
| G08 | L | Czat | Suma i największy sektor | `inventory_emissions_context`, **poprawna jednostka** (O07) | Później |
| G09 | L | Czat | Edycja wartości | Brak edycji z czatu, kierunek: strona podsektora albo „Draft with agent” | Później |
| G10 | L | Czat | Zmiana w mieście B bez dostępu | Brak danych B, brak rozróżnienia 403/404 (O12) | Później |
| G11 | L | Czat | „Fill my Stationary Energy data for me.” | Kierunek: „Draft with agent” na karcie SE, bez obietnicy zapisu z czatu (CC-967) | Później |
| G12 | L+D | Czat / HTTP | „Show data sources for inventory `<UUID B>`” oraz GET bez sesji | Odmowa / 401–403. **Według kodu: wyciek** (O02) | Później |
| G13 | L | Czat | „What are my total emissions in tonnes?” | Wartość = UI (tCO2e) ±zaokrąglenie | Później |
| G14 | L | Czat | G03 po portugalsku/hiszpańsku | Ten sam routing, w języku użytkownika | Później |
| G15 | L | Czat | Miasto z dwoma inwentarzami 2024 | Pytanie o `inventory_name/type/gwp` przed odczytem | Później |
| S01 | L | SE przed draftem | „What is my total Stationary Energy?” | Tylko narzędzie status/emisji, **bez startu draftu** | Później |
| S02 | L | SE przed draftem | „Add all SEEG data.” | `start_draft(continue_request=true)`, po wznowieniu karta bulk tylko dla wierszy SEEG, **brak stagingu przed akceptacją** | Później |
| S03 | L | SE draft | „Accept all recommendations.” | `request_all_recommended_confirmation`, po akceptacji staging dokładnie tych wyborów, zapis wymaga drugiej karty | Później |
| S04 | L+D | SE draft | „Save to inventory” → akceptacja karty | Wartości w CC = staging, sumy = UI, wpisy `VersionHistory` | Później |
| S05 | D | SE draft | Wiersz wypełniony w UI po drafcie, potem zapis | Konflikt i brak nadpisania. **Według kodu: nadpisanie** (O01) | Później |
| S06 | L+D | SE draft | Bulk NE z uzasadnieniem | Karta, staging, commit. Wypełniony wiersz odrzucony | Później |
| S07 | L | SE | „Upload my PDF” / „do Transport too” | Nieobsługiwane, kierunek do UI. **Brak doc. granic** (S11-SE) | Później |
| S08 | D | SE zapis | Faza 1 OK, faza 2 = 500/timeout | Spójny stan i komunikat. **Według kodu: rozjazd** (O03) | Później |
| S09 | D | SE generowanie | Restart procesu w `generating` | Przejście do `failed`/retry. **Według kodu: utknięcie** (O04) | Później |
| S10 | L | SE przed draftem | Inwentarz bez podłączonych źródeł | Jasny komunikat o braku źródeł, brak pustego draftu udającego sukces | Później |

Przy przenoszeniu do `climate-advisor/service/tests/real/scenarios.py` potrzebny jest seed GHGI
i obsługa narzędzi `inventory_*` w harnessie (jak w baseline).

---

## 8. Backtest liczbowy Stationary Energy (CC-950)

**Status: niewykonany.** W przypiętym HEAD nie ma danych golden CC-950 (C13). Proponowana
procedura, gdy dane będą dostępne:

1. Seed inwentarza (miasto i rok z CC-950) z pustym SE i podłączonymi źródłami jak w golden.
2. Deterministyczny draft z mockiem LLM: wybór `recommended_candidate`, potem commit przez
   prawdziwe trasy CC na testowej bazie.
3. Porównanie per numer GPC: `InventoryValue.co2eq` (kg) z golden (t ×1000), tolerancja
   zaokrąglenia, skalowanie populacją (`DataSourceService.ts:547-550`), oraz suma SE i udziały
   z `inventory_emissions_context` wobec wyników UI.
4. Asercje dodatkowe: brak nadpisań (O01), wpisy wersji (O11), idempotencja retry (O03).

---

## 9. Śledzalność MLflow dla przyszłych przebiegów live

- Środowisko: `test` (manifest `deployment-test.yml:33-40`: MLflow włączony, serwer
  `mlflow-dev.openearth.dev`, eksperyment „Clima”, tag `MLFLOW_ENVIRONMENT=test`).
  Przed przebiegami sprawdź runtime (`service/scripts/mlflow_preflight.py`).
- Korelacja: zapisz `request_id` i `thread_id` z SSE `done` (`streaming_handler.py:411-417`).
  Trace szukaj po metadanych `request_id` (`streaming_telemetry.py:82-101`). Dla SE dodatkowo
  `stationary_energy_draft_run_id`, a draft ma `trace_id` równy `request_id` tury startu.
- Dopóki O06 nie jest naprawione, **nie filtruj po `prompt_name`/`workflow`** dla tur SE przed
  draftem. Klasyfikuj je po zestawie narzędzi albo po wartości
  `stationary_energy_interaction_mode` w żądaniu.

---

## 10. Rekomendacja: agentowy create/import przez ingestion spine

1. **Nie parsuj plików w CA.** Plik ma iść do CC (upload w czacie albo istniejący dialog
   importu), a CA dostaje tylko DTO podsumowania i błędów walidacji (zgodnie z
   `GenericFileIngestionArchitecture.md:542-545`).
2. **Użyj spine jako jedynego runnera.** Plugin GHGI (CC-991) opakowuje istniejące
   `FileValidatorService`/`FormatAdapterService`/`ECRFImportService`/`InventoryImportService`.
   Trasy UI `import/*` stają się cienkimi wrapperami. Nie powstaje drugi importer.
3. **Capability dla agenta** (CC-993): `ghgi.import.start` (command, potwierdzenie przed
   startem z celem: miasto, rok, inwentarz), `ghgi.import.status` (query, odpowiada na
   „dlaczego mniej wierszy?” z `IngestItem.result/warnings`), `ghgi.import.confirm`
   (command, wymaga serwerowego wiązania `reviewDraftVersion`, `bundleDigest`,
   `sourceContentHash` i `targetBinding`).
4. **Validate/Decide są w Core:** agent nie może pominąć `decide`. Brakuje jeszcze
   `approve/resume` po `awaiting_review` i trwałego `IngestStore` na modelu `IngestJob`
   (dziś istnieje tylko `MemoryIngestStore`).
5. **`ghgi.inventory.create`** jako command z preflight (prerekwizyty: miasto, rok, typ, GWP,
   brak duplikatu z `list_accessible`) i tym samym modelem pending-action (O08).
6. **Wzorzec commitu SE do poprawy przed reużyciem:** ponowna walidacja celu (O01),
   idempotencja (O03), etykieta audytu (O11), odzyskiwanie zadań (O04).

---

## 11. Ograniczenia weryfikacji

- Brak przebiegów live LLM. Żadne twierdzenie o zachowaniu modelu nie pochodzi z samego promptu
  (O05 i O07 opisują ryzyko, nie obserwację).
- Brak uruchomienia CC (Next.js, Postgres) i testów Jest: przypięty checkout nie ma
  `node_modules`. O01, O02, O10, O11 i O12 to ustalenia z kodu.
- Testy pytest używały `.venv` z innego checkoutu z identycznym lockiem, a importy rozwiązywały
  się do przypiętego checkoutu.
- Konfiguracja MLflow pochodzi z manifestów k8s, bez sprawdzenia runtime.
- Brak danych CC-950. Nie było symulacji restartu poda ani timeoutu.
- Nie czytałem wyników innych audytorów w katalogu raportu.

---

## 12. Lista wszystkiego, co nie działa (stan na `fb6a0d000`)

**Defekty (do naprawy):**

1. **O01** — Zapis SE do inwentarza po cichu usuwa i nadpisuje wartości wpisane lub podłączone
   po wygenerowaniu draftu (`forceReplace=true`, brak ponownej walidacji, `destroy` przed
   pobraniem danych i poza transakcją, usunięcie niewersjonowane).
2. **O02** — `GET /api/v1/datasource/{inventoryId}` (i `/{sectorId}`) bez uwierzytelnienia
   i autoryzacji, osiągalny z Clima przez `get_all_datasources` z dowolnym ID.
3. **O03** — Dwufazowy zapis SE nie jest atomowy. Błąd albo timeout po pierwszej fazie daje
   rozjazd CA/CC i fałszywy błąd w UI.
4. **O04** — Przerwane generowanie draftu SE zostaje w `generating` na zawsze: polling UI bez
   końca, review i save zablokowane, retry dopuszcza równoległe generowanie.
5. **O05** — Prompt ogólnego czatu nie mówi, czego Clima nie potrafi (upload, tworzenie, import,
   edycja, status importu) i nie kieruje do UI.
6. **O06** — Tury SE przed draftem, w tym start draftu, są w MLflow i trace oznaczone jako zwykły czat.
7. **O09** — Na powierzchni SE rejestrowane są narzędzia HIAP spoza promptu SE, a test nie pokrywa
   produkcyjnej listy narzędzi.
8. **O10** — Manual override: `Mt`/`mt` → ×10⁶, „tons” = t, CO2e zapisywane jako CO2.
9. **O11** — Commity agenta są nieodróżnialne w historii wersji, a zastępowane wartości nie mają
   wpisu usunięcia.
10. **O12** — 403 i 404 rozróżniane i przekazywane modelowi (wyrocznia istnienia).

**Luki weryfikacji:**

11. **O07** — Brak reguły jednostek (kgCO2e z narzędzia, tCO2e w UI). DA w czacie niezweryfikowane.
12. **O13** — Backtest liczbowy SE niewykonalny: brak danych CC-950 i brak testów `commit.ts`.
13. Brak 15+ wykonanych scenariuszy z wynikami: rozdział 7 to plan.
14. Runtime MLflow w `test` niezweryfikowany (tylko manifest).

**Planowane braki (nie regresje):**

15. **O14** — Brak agentowego importu, uploadu i tworzenia inwentarza. Brak `ghgi.import.*`,
    `ghgi.inventory.create`, wejść spine (`ingest.start/status/confirm`), trwałego `IngestStore`,
    pluginu GHGI i `approve/resume` po review.
16. **O15** — Tylko sektor SE. Brak ścieżek fallback (manual, assisted, research request, upload),
    publish/CDP/restore, podsumowania wyników po zapisie, routingu z czatu do „Draft with agent”
    i E2E pełnego inwentarza.
17. **O08** — Brak generycznego, serwerowo wiązanego modelu pending-action. Karta zapisu nie
    pokazuje wierszy, wartości ani zastępowanych danych.
