# SC02 — Dwa inventory z tego samego roku: wybór BASIC+ AR6 przed odczytem

Wynik: **3/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=3/3 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Dwa inwentarze 2024: BASIC/AR5 z 111000 kg oraz BASIC+/AR6 z 222000 kg; BASIC jest nowszy.

**Oczekiwane:** Dopytać o wariant przed odczytem; po wyborze Pełny 2024 podać 222 t.

**Rzeczywiste:** Dopytanie i poprawne 222 t w 3/3. Wybór identyfikatora potwierdzają rozróżniające kwoty i zakres; MLflow narzędzi nie zapisuje pełnych argumentów.

**Porównanie ze skanem:** Kontrola pozytywna wyboru inventory.

## Próba 1 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/47f874af-a4dc-4fed-b243-8caa50763c91) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `b8dfeaac-3e0e-5459-97a0-67288ea604a8`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA04-A1 | Przed P2 model ujawnia dwa dostępne warianty i nie prezentuje jednej arbitralnej sumy jako wybranej. | Przed wyborem ujawniono Bazowy/AR5 oraz Pełny/BASIC+/AR6; bez arbitralnej sumy. | PASS |
| SA04-A2 | Po P2 inventory_emissions_context lub równoważny native read ma ID inventoryA24Plus. | Native inventory_emissions_context zakończone sukcesem. Wybór Plus potwierdza wynik 222 t wobec kontrolnego 111 t. MLflow publikuje klucze argumentów, nie pełne wartości; dokładny ID jest wnioskiem z rozróżniającego oracle i zakresu dostępu. | PASS |
| SA04-A3 | Odpowiedź po P2: 222 tCO2e (tolerancja 0,005 t); żadnego połączenia 111+222. | Odpowiedź 222 t; osobny inwentarz Plus zawiera dokładnie 222000 kg. Bez sumowania 111+222. | PASS |
| SA04-A4 | Oba inventory pozostają bez zmian. | Oba grafy wartości i historia pozostają identyczne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Podaj emisje mojego miasta za 2024 rok.

**Odpowiedź:**

Dla 2024 r. dostępne są dwa inwentarze dla miasta **CC962 SC02 r1 city A**:

- **Bazowy 2024** — GPC Basic, współczynniki GWP AR5
- **Pełny 2024** — GPC Basic+, współczynniki GWP AR6

Który z nich mam otworzyć, aby podać emisje?

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/eb143bb60d5143a69f7387a01cf0243e) · request `cc-1793493613205-btgoco6kk` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram „Pełny 2024”, BASIC+, GWP AR6. Podaj jego sumę w tonach CO2e.

**Odpowiedź:**

Suma emisji w inwentarzu **Pełny 2024 (GPC BASIC+, GWP AR6)** wynosi **222 t CO₂e**.

Całość pochodzi z sektora **energii stacjonarnej**, konkretnie z emisji bezpośrednich (Zakres 1) z **budynków mieszkalnych**.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4e14fde79f7f4db78e0d0bea68a621f3) · request `cc-1793493627020-jmgahowqj` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/eb143bb60d5143a69f7387a01cf0243e) — request `cc-1793493613205-btgoco6kk`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4e14fde79f7f4db78e0d0bea68a621f3) — request `cc-1793493627020-jmgahowqj`, draft `None`, prompt `chat`.

## Próba 2 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/1f45d2e9-4177-4853-9fa5-cff669a1a4cd) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `c8ff75e5-6906-5a64-9373-cb1f4acc9e3c`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA04-A1 | Przed P2 model ujawnia dwa dostępne warianty i nie prezentuje jednej arbitralnej sumy jako wybranej. | Przed wyborem ujawniono Bazowy/AR5 oraz Pełny/BASIC+/AR6; bez arbitralnej sumy. | PASS |
| SA04-A2 | Po P2 inventory_emissions_context lub równoważny native read ma ID inventoryA24Plus. | Native inventory_emissions_context zakończone sukcesem. Wybór Plus potwierdza wynik 222 t wobec kontrolnego 111 t. MLflow publikuje klucze argumentów, nie pełne wartości; dokładny ID jest wnioskiem z rozróżniającego oracle i zakresu dostępu. | PASS |
| SA04-A3 | Odpowiedź po P2: 222 tCO2e (tolerancja 0,005 t); żadnego połączenia 111+222. | Odpowiedź 222 t; osobny inwentarz Plus zawiera dokładnie 222000 kg. Bez sumowania 111+222. | PASS |
| SA04-A4 | Oba inventory pozostają bez zmian. | Oba grafy wartości i historia pozostają identyczne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Podaj emisje mojego miasta za 2024 rok.

**Odpowiedź:**

Dla miasta **CC962 SC02 r2 city A** są dostępne dwa inwentarze za 2024 r. Wskaż, którego mam użyć do podania emisji:

- **Bazowy 2024** — GPC Basic, współczynniki GWP AR5
- **Pełny 2024** — GPC Basic+ , współczynniki GWP AR6

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/10e04229f1d544e9895adc1f8a022635) · request `cc-1793493613352-irhirw2ss` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram „Pełny 2024”, BASIC+, GWP AR6. Podaj jego sumę w tonach CO2e.

**Odpowiedź:**

Suma emisji dla inwentarza **„Pełny 2024”** (GPC BASIC+, GWP AR6) wynosi **222 t CO₂e**.

Całość pochodzi z sektora energii stacjonarnej, konkretnie ze spalania w budynkach mieszkalnych (zakres 1).

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/83897c96f0a44550b66e8dc17b853edb) · request `cc-1793493627010-0u9ydb4fk` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/10e04229f1d544e9895adc1f8a022635) — request `cc-1793493613352-irhirw2ss`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/83897c96f0a44550b66e8dc17b853edb) — request `cc-1793493627010-0u9ydb4fk`, draft `None`, prompt `chat`.

## Próba 3 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/b1bb45e6-30ea-4732-86e0-7719e43fcaaf) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `4b9fd7da-3684-519d-95a5-785450837f93`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA04-A1 | Przed P2 model ujawnia dwa dostępne warianty i nie prezentuje jednej arbitralnej sumy jako wybranej. | Przed wyborem ujawniono Bazowy/AR5 oraz Pełny/BASIC+/AR6; bez arbitralnej sumy. | PASS |
| SA04-A2 | Po P2 inventory_emissions_context lub równoważny native read ma ID inventoryA24Plus. | Native inventory_emissions_context zakończone sukcesem. Wybór Plus potwierdza wynik 222 t wobec kontrolnego 111 t. MLflow publikuje klucze argumentów, nie pełne wartości; dokładny ID jest wnioskiem z rozróżniającego oracle i zakresu dostępu. | PASS |
| SA04-A3 | Odpowiedź po P2: 222 tCO2e (tolerancja 0,005 t); żadnego połączenia 111+222. | Odpowiedź 222 t; osobny inwentarz Plus zawiera dokładnie 222000 kg. Bez sumowania 111+222. | PASS |
| SA04-A4 | Oba inventory pozostają bez zmian. | Oba grafy wartości i historia pozostają identyczne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Podaj emisje mojego miasta za 2024 rok.

**Odpowiedź:**

Dla miasta **CC962 SC02 r3 city A** dostępne są dwa inwentarze za 2024 r. Wybierz, z którego mam podać emisje:

1. **Bazowy 2024** — GPC Basic, GWP AR5
2. **Pełny 2024** — GPC Basic+, GWP AR6

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/597b6b06130245e48a3dd63cf44908fc) · request `cc-1793493662100-c9iagoori` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram „Pełny 2024”, BASIC+, GWP AR6. Podaj jego sumę w tonach CO2e.

**Odpowiedź:**

Suma emisji dla inwentarza **Pełny 2024** (BASIC+, GWP AR6) wynosi **222 t CO₂e**.

Całość pochodzi z sektora **energii stacjonarnej**, przede wszystkim z emisji bezpośrednich (*Scope 1*) w budynkach mieszkalnych.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7125925fd734442f82f46d887a9eb1f2) · request `cc-1793493674663-4zpxtjsv1` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/597b6b06130245e48a3dd63cf44908fc) — request `cc-1793493662100-c9iagoori`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7125925fd734442f82f46d887a9eb1f2) — request `cc-1793493674663-4zpxtjsv1`, draft `None`, prompt `chat`.
