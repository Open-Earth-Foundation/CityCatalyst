# SC05 — Skala populacyjna 0,1: ta sama kwota w review i po zatwierdzonym zapisie

Wynik: **0/3** zaliczonych prób. GE=3, UW-kontrakt=0, PV=0. DA=5/12 (0/0 oznacza brak kontroli DA). ST: 2 różne wektory asercji.

**Dane:** Raw 1000000 kg, city population 100000 / country population 1000000; współczynnik 0,1; brak pola records.

**Oczekiwane:** Review, odpowiedź i commit: 100000 kg = 100 t.

**Rzeczywiste:** Review pokazuje 1 kt, payload CA nazywa 1000000 kg jako tCO2e, odpowiedź powiela błędną jednostkę 3/3. Commit zapisuje poprawne 100000 kg 3/3. Odczyt w czacie po zapisie: poprawny 2/3, odmowa podania sumy 1/3.

**Porównanie ze skanem:** F03/F04 live; dodatkowo niestabilny odczyt po commit.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/4c7ebb72-dfaa-47b2-ad70-257ad8d066a3) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `dc29d3c4-fcf2-5ee0-a57c-f7490d050b0b`; draft: `0954f37b-7715-437f-9a8d-cf7276a616b5`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](https://github.com/user-attachments/assets/8e35c963-9cdd-44be-a1d6-103803450e9b) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Review i odpowiedź P1 wskazują 100000 kg /100.000 t jako kwotę docelową. | Preview 1 kt = 1000000 kg; oracle 100000 kg = 100 t. CA row ma emissions_value=1000000 i błędne emissions_unit=tCO2e. | FAIL |
| A2 | Współczynnik jest dokładnie 0.1 i stosowany raz. | scale_factor=0.1 jest obecny, ale podgląd nie stosuje go do wartości. Commit stosuje go poprawnie raz. | FAIL |
| A3 | CC I.1.1 pozostaje puste przed kliknięciem karty. | Przed kliknięciem celu w CC nie było. | PASS |
| A4 | Po confirm istnieje dokładnie jeden InventoryValue I.1.1, co2eq=100000, CO2= 100000, CH4=N2O= 0. | Po commit: 1 parent, CO2e=100000 kg, parent CO2=100000 kg, CH4/N2O=0. | PASS |
| A5 | Results i P3 pokazują 100.000 t; zapis ma history create i datasourceId tego źródła. | Results API/UI: 100 t, datasourceId i history są obecne. P3 odmawia wiarygodnego odczytu. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla I.1.1 pokaż miejską emisję z SS03-country-population po przeskalowaniu ludności. Wyjaśnij surową wartość i współczynnik; podaj dokładnie tę liczbę, którą zapiszesz.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, zakres 1** rekomendowane źródło to **SS03-country-population** (rok 2024, dopasowanie miejskie).

- Surowa wartość w danych źródłowych: **1 000 000 tCO₂e**
- Współczynnik skalowania ludności: **0,1**
- Zastosowanie współczynnika dawałoby: **100 000 tCO₂e (100 ktCO₂e)**

Jednak panel rekomendacji wyświetla **1 ktCO₂e**, co nie zgadza się ani z surową wartością, ani z podanym współczynnikiem. Nie zapiszę tej pozycji, dopóki nie zostanie wyjaśniona ta rozbieżność — w aktualnym szkicu nie ma jednoznacznie podanej końcowej wartości po przeskalowaniu.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5a1dc6c69c9c4ec9a49d3505d5c38eeb) · request `cc-1793493660969-fuwoyxlou` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram SS03-country-population dla I.1.1. Przygotuj zapis do inwentaryzacji; potwierdzę kartę w interfejsie.

**Odpowiedź:**

Wybrałem **SS03-country-population** dla **I.1.1: budynki mieszkalne, zakres 1**. Karta potwierdzenia zapisu do inwentaryzacji jest gotowa — potwierdź ją w interfejsie.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/82aa48abe66446c7b94c9f67f9435653) · request `cc-1793493677045-idcc46bil` · model `openai/gpt-5.6-terra`.

**Prompt:** Odczytaj teraz emisje zapisane w tej inwentaryzacji i podaj sumę w tonach CO2e.

**Odpowiedź:**

Nie mogę podać wiarygodnej sumy zapisanych emisji z tego widoku: szkic potwierdza zapis I.1.1, ale nie zawiera aktualnego agregatu inwentaryzacji ani jednoznacznej wartości końcowej po zastosowaniu współczynnika skalowania.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/90e2223f1c504639a38c167d01b047e5) · request `cc-1793493709005-nyqkkgvj5` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/39fe47e6e1984c2bae240ff9b10da3da) — request `cc-1793493650916-12xf1orhr`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/edf18af413d34e8698abba6c8fd4600b) — request `None`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5a1dc6c69c9c4ec9a49d3505d5c38eeb) — request `cc-1793493660969-fuwoyxlou`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/82aa48abe66446c7b94c9f67f9435653) — request `cc-1793493677045-idcc46bil`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8c72604cf59d4b4e9cf58d7a99dec770) — request `cc-1793493694886-fjfslgbum`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d5a47292377a46ca906269b9d64b27ab) — request `cc-1793493699639-4wuaaaklw`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/90e2223f1c504639a38c167d01b047e5) — request `cc-1793493709005-nyqkkgvj5`, draft `0954f37b-7715-437f-9a8d-cf7276a616b5`, prompt `stationary_energy_review`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/1f1a6e5d-372c-4575-8ac0-8fe95a005a7c) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `33069aca-1bac-5d4c-9c8e-c017a25e4e6b`; draft: `c978f907-2e07-468a-b611-e9662881bc30`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](https://github.com/user-attachments/assets/96850b6e-ada3-4083-a94e-23a5eb705c2a) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Review i odpowiedź P1 wskazują 100000 kg /100.000 t jako kwotę docelową. | Preview 1 kt = 1000000 kg; oracle 100000 kg = 100 t. CA row ma emissions_value=1000000 i błędne emissions_unit=tCO2e. | FAIL |
| A2 | Współczynnik jest dokładnie 0.1 i stosowany raz. | scale_factor=0.1 jest obecny, ale podgląd nie stosuje go do wartości. Commit stosuje go poprawnie raz. | FAIL |
| A3 | CC I.1.1 pozostaje puste przed kliknięciem karty. | Przed kliknięciem celu w CC nie było. | PASS |
| A4 | Po confirm istnieje dokładnie jeden InventoryValue I.1.1, co2eq=100000, CO2= 100000, CH4=N2O= 0. | Po commit: 1 parent, CO2e=100000 kg, parent CO2=100000 kg, CH4/N2O=0. | PASS |
| A5 | Results i P3 pokazują 100.000 t; zapis ma history create i datasourceId tego źródła. | Results API/UI: 100 t, datasourceId i history są obecne. P3 odczytuje poprawne 100 t. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla I.1.1 pokaż miejską emisję z SS03-country-population po przeskalowaniu ludności. Wyjaśnij surową wartość i współczynnik; podaj dokładnie tę liczbę, którą zapiszesz.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, Scope 1** źródło **SS03-country-population** podaje surowo **1 000 000 tCO₂e**.

Współczynnik skalowania ludności wynosi **0,1**, więc:

**1 000 000 tCO₂e × 0,1 = 100 000 tCO₂e**
czyli **100 ktCO₂e**.

To jest liczba wynikająca z danych źródłowych i współczynnika skalowania. W panelu skróconym widnieje natomiast **1 ktCO₂e**, co nie zgadza się z tym przeliczeniem — przed zapisaniem warto tę rozbieżność wyjaśnić.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/67f19d2599ff41a3b719795af23881b1) · request `cc-1793493872499-wojimoeo7` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram SS03-country-population dla I.1.1. Przygotuj zapis do inwentaryzacji; potwierdzę kartę w interfejsie.

**Odpowiedź:**

Wybrałem **SS03-country-population** dla **I.1.1 — budynki mieszkalne, Scope 1** i przygotowałem ten wiersz do zapisu. Karta potwierdzenia zapisu do inwentaryzacji jest gotowa w interfejsie.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/64571824947844aea27632b0c3868598) · request `cc-1793493888510-nwq9kug32` · model `openai/gpt-5.6-terra`.

**Prompt:** Odczytaj teraz emisje zapisane w tej inwentaryzacji i podaj sumę w tonach CO2e.

**Odpowiedź:**

W inwentaryzacji zapisano łącznie **100 tCO₂e**.

Całość pochodzi z **Stationary Energy — budynki mieszkalne, Scope 1**; to jedyny obecnie wypełniony wpis ze źródła zewnętrznego.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a27ae1e882224a80be1fb9d1e7556b03) · request `cc-1793493944262-rlb0j2pv9` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b436b909b6ec4081a3a906e789663b90) — request `cc-1793493858329-vcm42ycx9`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/07a237f2e251442582e9ba77816cf20c) — request `None`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/67f19d2599ff41a3b719795af23881b1) — request `cc-1793493872499-wojimoeo7`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/64571824947844aea27632b0c3868598) — request `cc-1793493888510-nwq9kug32`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/bcb1b42d48214a1296f6bd4cc3df1ba4) — request `cc-1793493920338-28maq1fyu`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7f346e7442124ab6994895df22c1deda) — request `cc-1793493931106-47kxepolv`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a27ae1e882224a80be1fb9d1e7556b03) — request `cc-1793493944262-rlb0j2pv9`, draft `c978f907-2e07-468a-b611-e9662881bc30`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/5a4a71e0-5d95-45f3-b956-8399283ef36c) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `102c1229-3b41-5861-96a2-719d84774b43`; draft: `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](https://github.com/user-attachments/assets/39cd6160-bf1a-408d-bf69-d9cd24c0c745) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Review i odpowiedź P1 wskazują 100000 kg /100.000 t jako kwotę docelową. | Preview 1 kt = 1000000 kg; oracle 100000 kg = 100 t. CA row ma emissions_value=1000000 i błędne emissions_unit=tCO2e. | FAIL |
| A2 | Współczynnik jest dokładnie 0.1 i stosowany raz. | scale_factor=0.1 jest obecny, ale podgląd nie stosuje go do wartości. Commit stosuje go poprawnie raz. | FAIL |
| A3 | CC I.1.1 pozostaje puste przed kliknięciem karty. | Przed kliknięciem celu w CC nie było. | PASS |
| A4 | Po confirm istnieje dokładnie jeden InventoryValue I.1.1, co2eq=100000, CO2= 100000, CH4=N2O= 0. | Po commit: 1 parent, CO2e=100000 kg, parent CO2=100000 kg, CH4/N2O=0. | PASS |
| A5 | Results i P3 pokazują 100.000 t; zapis ma history create i datasourceId tego źródła. | Results API/UI: 100 t, datasourceId i history są obecne. P3 odczytuje poprawne 100 t. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla I.1.1 pokaż miejską emisję z SS03-country-population po przeskalowaniu ludności. Wyjaśnij surową wartość i współczynnik; podaj dokładnie tę liczbę, którą zapiszesz.

**Odpowiedź:**

Dla **I.1.1 — Budynki mieszkalne, zakres 1** wybranym źródłem jest **SS03-country-population**.

- Wartość w rekordzie źródłowym: **1 000 000 tCO₂e**
- Współczynnik skalowania ludności: **0,1**
- Widok decyzji w Clima pokazuje wartość do zapisania jako: **1 ktCO₂e**.

Uwaga: zapis źródłowy i współczynnik nie pozwalają jednoznacznie odtworzyć tej wartości arytmetycznie — proste mnożenie dawałoby 100 000 tCO₂e. Dlatego dokładną wartością, którą Clima oznacza do zapisania dla tej propozycji, jest **1 ktCO₂e**, a nie wartość wyliczona przeze mnie.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d85204868ce24337bcb71dd30ffdb226) · request `cc-1793493872643-xoanqm4b1` · model `openai/gpt-5.6-terra`.

**Prompt:** Wybieram SS03-country-population dla I.1.1. Przygotuj zapis do inwentaryzacji; potwierdzę kartę w interfejsie.

**Odpowiedź:**

Przygotowałem I.1.1 do zapisu z **SS03-country-population**. Karta potwierdzenia zapisu do inwentaryzacji jest gotowa w interfejsie — potwierdź ją, aby kontynuować.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d2e2be97d74e4e3c9c150ab3da77ad5e) · request `cc-1793493888638-tprl1gk8z` · model `openai/gpt-5.6-terra`.

**Prompt:** Odczytaj teraz emisje zapisane w tej inwentaryzacji i podaj sumę w tonach CO2e.

**Odpowiedź:**

Suma zapisanych emisji w inwentaryzacji wynosi **100 tCO₂e**.

Całość przypisana jest do **Stationary Energy → Residential buildings → Scope 1** i pochodzi z jednego źródła zewnętrznego.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/acacc560c25a45c184fc090b2321b8df) · request `cc-1793493944141-5kcc9f1ci` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/701358043eca42d593b4b9c76fd371bb) — request `cc-1793493858092-2p5qkm7bc`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6f50f07f387742bea2d540454b302e0d) — request `None`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d85204868ce24337bcb71dd30ffdb226) — request `cc-1793493872643-xoanqm4b1`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d2e2be97d74e4e3c9c150ab3da77ad5e) — request `cc-1793493888638-tprl1gk8z`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4f7dcc139cdf4eba83b0ab397acf75d9) — request `cc-1793493920390-6m639xnpv`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/205914bcf8304fe9ac34d76829611703) — request `cc-1793493930996-lfmdigtl9`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/acacc560c25a45c184fc090b2321b8df) — request `cc-1793493944141-5kcc9f1ci`, draft `c47bdecc-55f0-486d-9c81-c9aaa053cdb6`, prompt `stationary_energy_review`.
