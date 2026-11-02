# SC03 — Suma inventory: kilogramy z narzędzia, tony i udział sektora w odpowiedzi

Wynik: **3/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=9/9 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** I.1.1=750000, II.1.1=375000, III.1.1=125000 kg CO2e.

**Oczekiwane:** 1250000 kg = 1250 t; Stationary Energy 750 t, udział 60%.

**Rzeczywiste:** Wszystkie obliczenia poprawne 3/3; potwierdzone odczytem Results API i rzeczywistym UI. Nagłówek 1.2 kt jest skrótem prezentacji.

**Porównanie ze skanem:** Kontrola pozytywna jednostek i agregatu.

## Próba 1 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `2d2a3172-2af6-5074-9636-16914fbddef8`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Wywołano inventory_emissions_context dla dokładnego inventory SS01. | Wywołano inventory_emissions_context w scope jedynego dostępnego inwentarza fixture. | PASS |
| A2 | Suma = 1250000 kgCO2e i 1250.000 tCO2e. | Model: 1250 t i 1250000 kg. Results API: 1250000 kg. | PASS |
| A3 | Największy sektor to I, emisje 750000 kg / 750.000 t. | Sektor I: 750000 kg = 750 t; potwierdza Results API. | PASS |
| A4 | Udział I wynosi 60.00%, różnica ≤0.01 punktu procentowego. | Udział I = 60%; oracle 750000/1250000. | PASS |
| A5 | Hash danych CC i liczba history identyczne przed/po. | Wartości/gazy/history bez zmian. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla bieżącej inwentaryzacji za 2024 podaj sumę emisji w tonach CO2e oraz największy sektor, jego emisje w tonach i udział procentowy. Podaj też sumę w kg CO2e, żebym mógł sprawdzić jednostki.

**Odpowiedź:**

Dla bieżącej inwentaryzacji **2024**:

- **Suma emisji:** **1 250 tCO2e**
- **Suma w kilogramach:** **1 250 000 kg CO2e**

Największy sektor:
- **Energia stacjonarna**
- **750 tCO2e** (**750 000 kg CO2e**)
- **60%** całkowitych emisji

Przeliczenie kontrolne: 1 250 000 kg CO2e ÷ 1 000 = 1 250 tCO2e.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c17d55fd003e4515aeae58836b92a53d) · request `cc-1793493657477-lypenoxsb` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c17d55fd003e4515aeae58836b92a53d) — request `cc-1793493657477-lypenoxsb`, draft `None`, prompt `chat`.

## Próba 2 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `129df186-0b44-503c-979f-b41761c610ae`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Wywołano inventory_emissions_context dla dokładnego inventory SS01. | Wywołano inventory_emissions_context w scope jedynego dostępnego inwentarza fixture. | PASS |
| A2 | Suma = 1250000 kgCO2e i 1250.000 tCO2e. | Model: 1250 t i 1250000 kg. Results API: 1250000 kg. | PASS |
| A3 | Największy sektor to I, emisje 750000 kg / 750.000 t. | Sektor I: 750000 kg = 750 t; potwierdza Results API. | PASS |
| A4 | Udział I wynosi 60.00%, różnica ≤0.01 punktu procentowego. | Udział I = 60%; oracle 750000/1250000. | PASS |
| A5 | Hash danych CC i liczba history identyczne przed/po. | Wartości/gazy/history bez zmian. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla bieżącej inwentaryzacji za 2024 podaj sumę emisji w tonach CO2e oraz największy sektor, jego emisje w tonach i udział procentowy. Podaj też sumę w kg CO2e, żebym mógł sprawdzić jednostki.

**Odpowiedź:**

Dla bieżącej inwentaryzacji za **2024**:

- **Suma emisji:** **1 250 tCO₂e**
- **Suma w kilogramach:** **1 250 000 kgCO₂e**

Największy sektor:
- **Energia stacjonarna:** **750 tCO₂e** (**750 000 kgCO₂e**)
- **Udział w całkowitych emisjach:** **60%**

Przeliczenie kontrolne: 1 250 000 kgCO₂e ÷ 1 000 = 1 250 tCO₂e.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ae2f72bf910342f090baf028ca4f0670) · request `cc-1793493685121-iclokbrb4` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ae2f72bf910342f090baf028ca4f0670) — request `cc-1793493685121-iclokbrb4`, draft `None`, prompt `chat`.

## Próba 3 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `9ab3e3d0-2fdb-522b-b8f1-a52f0afe797a`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Wywołano inventory_emissions_context dla dokładnego inventory SS01. | Wywołano inventory_emissions_context w scope jedynego dostępnego inwentarza fixture. | PASS |
| A2 | Suma = 1250000 kgCO2e i 1250.000 tCO2e. | Model: 1250 t i 1250000 kg. Results API: 1250000 kg. | PASS |
| A3 | Największy sektor to I, emisje 750000 kg / 750.000 t. | Sektor I: 750000 kg = 750 t; potwierdza Results API. | PASS |
| A4 | Udział I wynosi 60.00%, różnica ≤0.01 punktu procentowego. | Udział I = 60%; oracle 750000/1250000. | PASS |
| A5 | Hash danych CC i liczba history identyczne przed/po. | Wartości/gazy/history bez zmian. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Dla bieżącej inwentaryzacji za 2024 podaj sumę emisji w tonach CO2e oraz największy sektor, jego emisje w tonach i udział procentowy. Podaj też sumę w kg CO2e, żebym mógł sprawdzić jednostki.

**Odpowiedź:**

Dla bieżącej inwentaryzacji za **2024 r.**:

- **Łączne emisje:** **1 250 tCO2e**
- **To samo w kilogramach:** **1 250 000 kgCO2e**

**Największy sektor:** Energia stacjonarna  
- Emisje: **750 tCO2e** (**750 000 kgCO2e**)  
- Udział w całkowitych emisjach: **60%**

Przeliczenie kontrolne: **1 tCO2e = 1 000 kgCO2e**.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e3e513d95bea4c1bbd1c59c215a19bf1) · request `cc-1793493699483-io28z9iuf` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e3e513d95bea4c1bbd1c59c215a19bf1) — request `cc-1793493699483-io28z9iuf`, draft `None`, prompt `chat`.

