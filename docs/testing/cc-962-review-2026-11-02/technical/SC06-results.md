# SC06 — Puste records nie usuwa dodatniego totals i nie uzasadnia NE

Wynik: **0/3** zaliczonych prób. GE=3, UW-kontrakt=0, PV=0. DA=3/6 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** records=[] oraz dodatnie totals=640000 kg.

**Oczekiwane:** Nie zgubić totals; pokazać 640 t; nie wnioskować NE/NO z pustej tablicy.

**Rzeczywiste:** Raw zachowuje totals, ale propozycja jest gap/null, a odpowiedź mówi o braku wartości 3/3. Brak automatycznego NE/NO i brak zapisu CC.

**Porównanie ze skanem:** F05 live; błąd normalizacji/kontekstu, nie wyłącznie rozumowania modelu.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/46aef48f-9765-4274-8764-c6835f6ad674) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `97a6c51d-9a75-5507-82b7-ad2df0b9e2ab`; draft: `8f461023-6796-40cf-a600-9a09bf69ed0f`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Raw source_data zawiera records=[] i totals.co2eq_100yr=640000. | CA source_data zachowuje records=[] oraz totals=640000 kg. | PASS |
| A2 | Proposal dla I.1.1 ma status ready i źródło SS05-empty-records; nie gap. | Proposal ma status gap, zamiast ready. | FAIL |
| A3 | Kwota preview i odpowiedzi =640000 kg/640.000 t. | Proposed value jest null; UI/model twierdzą, że nie ma wartości, mimo dodatnich totals=640000 kg. | FAIL |
| A4 | Nie ma staged NE/NO ani jakiejkolwiek zmiany CC. | Brak staged NE/NO i brak zmian CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Czy dla I.1.1 mamy dane z SS05-empty-records? Pokaż wartość i powiedz, czy brak szczegółowych rekordów oznacza brak emisji. Niczego jeszcze nie zmieniaj.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, spalanie paliw w granicach miasta (Scope 1)** źródło **SS05-empty-records** jest oznaczone jako mające zgodność z miastem i rokiem 2024, ale nie zawiera żadnych szczegółowych rekordów ani wartości emisji do zastosowania.

**Wartość:** brak — nie ma dostępnej wartości aktywności ani emisji.
Brak szczegółowych rekordów **nie oznacza zerowych emisji**; oznacza wyłącznie, że z tego źródła nie można obecnie oszacować ani potwierdzić emisji dla tego wiersza. Nic nie zmieniłem.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/43171219b1a2490faf51b5f087a68c4e) · request `cc-1793493751917-xqt6zrvu1` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7b470e9962874d30a2c9903e5d1f4022) — request `cc-1793493738390-oi9p2dhg1`, draft `8f461023-6796-40cf-a600-9a09bf69ed0f`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/856f243cb8cd4829850f78a17d282ccf) — request `None`, draft `8f461023-6796-40cf-a600-9a09bf69ed0f`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/43171219b1a2490faf51b5f087a68c4e) — request `cc-1793493751917-xqt6zrvu1`, draft `8f461023-6796-40cf-a600-9a09bf69ed0f`, prompt `stationary_energy_review`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/e9c14f93-f9c6-4402-a98b-e44e7feb200b) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `0366331f-3f56-56d2-8a5b-1a2d34eade37`; draft: `ae326f3f-8f82-469e-adab-07c462e83967`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Raw source_data zawiera records=[] i totals.co2eq_100yr=640000. | CA source_data zachowuje records=[] oraz totals=640000 kg. | PASS |
| A2 | Proposal dla I.1.1 ma status ready i źródło SS05-empty-records; nie gap. | Proposal ma status gap, zamiast ready. | FAIL |
| A3 | Kwota preview i odpowiedzi =640000 kg/640.000 t. | Proposed value jest null; UI/model twierdzą, że nie ma wartości, mimo dodatnich totals=640000 kg. | FAIL |
| A4 | Nie ma staged NE/NO ani jakiejkolwiek zmiany CC. | Brak staged NE/NO i brak zmian CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Czy dla I.1.1 mamy dane z SS05-empty-records? Pokaż wartość i powiedz, czy brak szczegółowych rekordów oznacza brak emisji. Niczego jeszcze nie zmieniaj.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, Scope 1** dostępne jest źródło **SS05-empty-records** z 2024 r., dopasowane na poziomie miasta. Nie zawiera jednak szczegółowych rekordów ani wartości aktywności czy emisji, więc dla tego wiersza **nie ma wartości do pokazania**.

Brak szczegółowych rekordów **nie oznacza braku emisji**. Oznacza tylko, że to źródło nie dostarcza danych pozwalających oszacować emisje dla I.1.1. Wiersz pozostaje luką i można później rozważyć odpowiedni klucz notacyjny. Nic nie zostało zmienione.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/eabe747d31904d9a9de9c584dba240c9) · request `cc-1793493752095-2qilcq2mj` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/791bb99a65c848b397ae3ffd0bb3f744) — request `cc-1793493738232-vm06tcnnl`, draft `ae326f3f-8f82-469e-adab-07c462e83967`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/0dfddbc3aaff45d8a60ad050933e4f47) — request `None`, draft `ae326f3f-8f82-469e-adab-07c462e83967`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/eabe747d31904d9a9de9c584dba240c9) — request `cc-1793493752095-2qilcq2mj`, draft `ae326f3f-8f82-469e-adab-07c462e83967`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/1b1b188a-408c-4d57-a589-5f2fb4187a44) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `23fcfbf7-ae04-524f-b46d-f5ac6e2d42f5`; draft: `4c2a4b97-d124-492c-bcaf-9765f523a031`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Raw source_data zawiera records=[] i totals.co2eq_100yr=640000. | CA source_data zachowuje records=[] oraz totals=640000 kg. | PASS |
| A2 | Proposal dla I.1.1 ma status ready i źródło SS05-empty-records; nie gap. | Proposal ma status gap, zamiast ready. | FAIL |
| A3 | Kwota preview i odpowiedzi =640000 kg/640.000 t. | Proposed value jest null; UI/model twierdzą, że nie ma wartości, mimo dodatnich totals=640000 kg. | FAIL |
| A4 | Nie ma staged NE/NO ani jakiejkolwiek zmiany CC. | Brak staged NE/NO i brak zmian CC. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Czy dla I.1.1 mamy dane z SS05-empty-records? Pokaż wartość i powiedz, czy brak szczegółowych rekordów oznacza brak emisji. Niczego jeszcze nie zmieniaj.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, spalanie paliw w granicach miasta (Scope 1)** źródło **SS05-empty-records** jest oznaczone jako mające zastosowanie do miasta i roku 2024, ale **nie zawiera żadnych szczegółowych rekordów ani wartości emisji**. Dlatego nie ma wartości, którą można pokazać lub zaproponować dla tego wiersza.

Brak szczegółowych rekordów **nie oznacza automatycznie zerowych emisji**. Oznacza tylko, że to źródło nie dostarcza danych pozwalających oszacować emisje dla I.1.1. Wiersz pozostaje pusty; nie wprowadzam żadnych zmian.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f0a50fd280d34632ab1f5ab12b918d9b) · request `cc-1793493914908-eazfsbv4x` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b0a2ffe422304fdc86f8f745b697acce) — request `cc-1793493888262-2edxfy7ih`, draft `4c2a4b97-d124-492c-bcaf-9765f523a031`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6302195c94144073a0f67fffc2f9f066) — request `None`, draft `4c2a4b97-d124-492c-bcaf-9765f523a031`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f0a50fd280d34632ab1f5ab12b918d9b) — request `cc-1793493914908-eazfsbv4x`, draft `4c2a4b97-d124-492c-bcaf-9765f523a031`, prompt `stationary_energy_review`.
