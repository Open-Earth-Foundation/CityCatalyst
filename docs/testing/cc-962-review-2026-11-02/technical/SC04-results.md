# SC04 — SE przed draftem: kontrola regresji CC-967 „Add all SEEG data” z wierszem-dystraktorem

Wynik: **0/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=0/0 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Dwa rzeczywiste feedy starego SEEG dla São Paulo 2022 (residential/commercial), sklonowane mapowanie katalogu do własnej fixture; obcy FX-OTHER 200000 kg.

**Oczekiwane:** Jeden start i kontynuacja; tylko dwa SEEG w karcie i stagingu, bez FX-OTHER i bez zapisu CC; właściwe tagi MLflow.

**Rzeczywiste:** Routing, karta, staging 2 wyborów i brak zapisu CC działają 3/3. Pre-run jest jednak tagowany prompt_name=chat / ca_agentic_flow=false 3/3, więc ścisły kontrakt nie przechodzi.

**Porównanie ze skanem:** F10 live. Pierwotny oracle A4 wskazywał złą tabelę: użyto staged_review_selections zamiast review_decisions; zamiennik zachowania przechodzi 3/3.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `900b4c1f-1fff-5445-942a-cb3c705c41b3`; draft: `a41d444a-0f26-4a1b-a717-f01f2461c3d7`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO04-A1 | Jeden start z kontynuacją | Dokładnie jedno stationary_energy_start_draft; późniejsze wznowienie wykonuje pierwotne Add all SEEG data. | PASS |
| SO04-A2 | Zakres karty bulk | Potwierdzona karta dotyczy dokładnie dwóch propozycji SEEG; dystraktor FX-OTHER nie należy do zbioru. | PASS |
| SO04-A3 | Brak stagingu przed akceptacją | Przed kartą 0 trwałych decyzji i 0 staged_review_selections. | PASS |
| SO04-A4 | Staging po akceptacji | Pierwotny oracle wskazywał review_decisions, ale bulk działa przez osobną tabelę staged_review_selections. Nie jest to usterka produktu. Po akceptacji zapisano 2 tymczasowe wybory; review_decisions nadal 0. | INVALID_ORACLE |
| SO04-A5 | Dystraktor nietknięty | Dystraktor source-backed pozostaje bez decyzji. | PASS |
| SO04-A6 | Brak zapisu w CC | Brak InventoryValue i nowych Version w CC. | PASS |
| SO04-A7 | Język stanu | Odpowiedzi mówią o stage/review draft, nie o ukończonym zapisie do CC. | PASS |
| SO04-A8-parent | Tag promptu pre-run odpowiada faktycznym instrukcjom SE | Rzeczywisty prompt_name=chat; oczekiwano stationary_energy_review. ca_agentic_flow=False odnotowano diagnostycznie, bez osobnego werdyktu. | FAIL |
| LIVE-A4 | Bulk utrwala tymczasowe wybory CA dla SEEG, bez commitu CC. | 2 staged_review_selections; 0 review_decisions; bez zapisu CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Add all SEEG data.

**Odpowiedź:**

I’m searching the connected sources for SEEG data and will continue once the draft is ready.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e04fcce3110a47288f970035a3d2aa6f) · request `cc-1793495602487-7dlx6egi8` · model `openai/gpt-5.6-terra`.

**Prompt:** Add all SEEG data.

**Odpowiedź:**

I found SEEG data for two rows and opened a confirmation card:

- Scope 1 Residential Buildings — fuel combustion  
- Scope 1 Commercial & Institutional Buildings — fuel combustion  

Confirm the card to stage these two SEEG selections.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ec582328ffdc487dba2d463fa62a8f3d) · request `cc-1793495642857-8yv88ii97` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, apply these review choices.

**Odpowiedź:**

I staged the SEEG selections for:

- Scope 1 Residential Buildings — fuel combustion  
- Scope 1 Commercial & Institutional Buildings — fuel combustion  

They are ready to save in Clima.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8738ac4ec17c41ec99822215b6853bdc) · request `cc-1793495668877-7743rowth` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e04fcce3110a47288f970035a3d2aa6f) — request `cc-1793495602487-7dlx6egi8`, draft `None`, prompt `chat`.
- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8cd292bd41cc48149c832874e2888800) — request `cc-1793495602487-7dlx6egi8`, draft `a41d444a-0f26-4a1b-a717-f01f2461c3d7`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/649395e506ea4fb19dea834c2a928076) — request `None`, draft `a41d444a-0f26-4a1b-a717-f01f2461c3d7`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ec582328ffdc487dba2d463fa62a8f3d) — request `cc-1793495642857-8yv88ii97`, draft `a41d444a-0f26-4a1b-a717-f01f2461c3d7`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8738ac4ec17c41ec99822215b6853bdc) — request `cc-1793495668877-7743rowth`, draft `a41d444a-0f26-4a1b-a717-f01f2461c3d7`, prompt `stationary_energy_review`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `e2d405fc-97a0-5aa3-a74a-4ee161b053a3`; draft: `7871c586-c0e0-4714-bc90-eb433d8bbbf7`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO04-A1 | Jeden start z kontynuacją | Dokładnie jedno stationary_energy_start_draft; późniejsze wznowienie wykonuje pierwotne Add all SEEG data. | PASS |
| SO04-A2 | Zakres karty bulk | Potwierdzona karta dotyczy dokładnie dwóch propozycji SEEG; dystraktor FX-OTHER nie należy do zbioru. | PASS |
| SO04-A3 | Brak stagingu przed akceptacją | Przed kartą 0 trwałych decyzji i 0 staged_review_selections. | PASS |
| SO04-A4 | Staging po akceptacji | Pierwotny oracle wskazywał review_decisions, ale bulk działa przez osobną tabelę staged_review_selections. Nie jest to usterka produktu. Po akceptacji zapisano 2 tymczasowe wybory; review_decisions nadal 0. | INVALID_ORACLE |
| SO04-A5 | Dystraktor nietknięty | Dystraktor source-backed pozostaje bez decyzji. | PASS |
| SO04-A6 | Brak zapisu w CC | Brak InventoryValue i nowych Version w CC. | PASS |
| SO04-A7 | Język stanu | Odpowiedzi mówią o stage/review draft, nie o ukończonym zapisie do CC. | PASS |
| SO04-A8-parent | Tag promptu pre-run odpowiada faktycznym instrukcjom SE | Rzeczywisty prompt_name=chat; oczekiwano stationary_energy_review. ca_agentic_flow=False odnotowano diagnostycznie, bez osobnego werdyktu. | FAIL |
| LIVE-A4 | Bulk utrwala tymczasowe wybory CA dla SEEG, bez commitu CC. | 2 staged_review_selections; 0 review_decisions; bez zapisu CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Add all SEEG data.

**Odpowiedź:**

I’m searching the connected sources for SEEG data and will continue once the Stationary Energy proposals are ready.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7aa454f9994f4a7ab61eb74f004bca17) · request `cc-1793495602646-y8zogxjw7` · model `openai/gpt-5.6-terra`.

**Prompt:** None

**Odpowiedź:**

I found two applicable SEEG city-level sources for 2022—Scope 1 residential and commercial/institutional fuel combustion. Please confirm the review card to stage them.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/edd8ed6270a24cee95eb943006045166) · request `cc-1793495627365-5pn8cqtnx` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, apply these review choices.

**Odpowiedź:**

Staged the SEEG sources for:

- Scope 1 commercial and institutional fuel combustion  
- Scope 1 residential fuel combustion  

They are ready to save in the Clima review draft.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/12cbab87b9e74065851a7541f2e79633) · request `cc-1793495657184-wesimfz5g` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7aa454f9994f4a7ab61eb74f004bca17) — request `cc-1793495602646-y8zogxjw7`, draft `None`, prompt `chat`.
- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7da96ad33eea4abb836ad82e6479cc3e) — request `cc-1793495602646-y8zogxjw7`, draft `7871c586-c0e0-4714-bc90-eb433d8bbbf7`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/1a6fb3ec77f54b8f92d401fa7621b0b1) — request `None`, draft `7871c586-c0e0-4714-bc90-eb433d8bbbf7`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/edd8ed6270a24cee95eb943006045166) — request `cc-1793495627365-5pn8cqtnx`, draft `7871c586-c0e0-4714-bc90-eb433d8bbbf7`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/12cbab87b9e74065851a7541f2e79633) — request `cc-1793495657184-wesimfz5g`, draft `7871c586-c0e0-4714-bc90-eb433d8bbbf7`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `089840af-1c3f-56d6-b120-27842c2068d6`; draft: `d3de4394-6c55-4692-863e-128691fd7781`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO04-A1 | Jeden start z kontynuacją | Dokładnie jedno stationary_energy_start_draft; późniejsze wznowienie wykonuje pierwotne Add all SEEG data. | PASS |
| SO04-A2 | Zakres karty bulk | Potwierdzona karta dotyczy dokładnie dwóch propozycji SEEG; dystraktor FX-OTHER nie należy do zbioru. | PASS |
| SO04-A3 | Brak stagingu przed akceptacją | Przed kartą 0 trwałych decyzji i 0 staged_review_selections. | PASS |
| SO04-A4 | Staging po akceptacji | Pierwotny oracle wskazywał review_decisions, ale bulk działa przez osobną tabelę staged_review_selections. Nie jest to usterka produktu. Po akceptacji zapisano 2 tymczasowe wybory; review_decisions nadal 0. | INVALID_ORACLE |
| SO04-A5 | Dystraktor nietknięty | Dystraktor source-backed pozostaje bez decyzji. | PASS |
| SO04-A6 | Brak zapisu w CC | Brak InventoryValue i nowych Version w CC. | PASS |
| SO04-A7 | Język stanu | Odpowiedzi mówią o stage/review draft, nie o ukończonym zapisie do CC. | PASS |
| SO04-A8-parent | Tag promptu pre-run odpowiada faktycznym instrukcjom SE | Rzeczywisty prompt_name=chat; oczekiwano stationary_energy_review. ca_agentic_flow=False odnotowano diagnostycznie, bez osobnego werdyktu. | FAIL |
| LIVE-A4 | Bulk utrwala tymczasowe wybory CA dla SEEG, bez commitu CC. | 2 staged_review_selections; 0 review_decisions; bez zapisu CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Add all SEEG data.

**Odpowiedź:**

I’m searching the connected sources for SEEG data and will continue once the draft is ready.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2d569cace9de43569c43428832f20059) · request `cc-1793495699625-t5qx1phpm` · model `openai/gpt-5.6-terra`.

**Prompt:** Add all SEEG data.

**Odpowiedź:**

I found SEEG data for two Scope 1 rows—Residential Buildings and Commercial & Institutional Buildings. Please confirm the review card to stage these selections.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/1235542d3a2048dcb6a26f69cc13e376) · request `cc-1793495736337-ypjh1j1vf` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, apply these review choices.

**Odpowiedź:**

Staged the SEEG selections for:

- Residential Buildings — Scope 1 fuel combustion
- Commercial & Institutional Buildings — Scope 1 fuel combustion

One source-backed review decision remains pending.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/79ded6005a784fcfa6d54a8638a3ae4f) · request `cc-1793495759494-b4g6shic7` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2d569cace9de43569c43428832f20059) — request `cc-1793495699625-t5qx1phpm`, draft `None`, prompt `chat`.
- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/03a02717eb204b989f4c647abd1bd720) — request `cc-1793495699625-t5qx1phpm`, draft `d3de4394-6c55-4692-863e-128691fd7781`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5ca5adb1c92e41c68237815b0c044900) — request `None`, draft `d3de4394-6c55-4692-863e-128691fd7781`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/1235542d3a2048dcb6a26f69cc13e376) — request `cc-1793495736337-ypjh1j1vf`, draft `d3de4394-6c55-4692-863e-128691fd7781`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/79ded6005a784fcfa6d54a8638a3ae4f) — request `cc-1793495759494-b4g6shic7`, draft `d3de4394-6c55-4692-863e-128691fd7781`, prompt `stationary_energy_review`.

