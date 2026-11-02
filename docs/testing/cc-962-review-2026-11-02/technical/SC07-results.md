# SC07 — Wiele records z gases[]: suma źródła i rozdzielenie masy CH4 od CO2e

Wynik: **0/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=9/12 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Dwie aktywności: CO2 100000; CO2 372000 + CH4 1000 kg. Zamrożone GWP100(CH4)=28, GWP20=84.

**Oczekiwane:** 500000 kg CO2e; CO2 472000 kg; CH4 masa 1000 kg, wkład 28000 kg CO2e.

**Rzeczywiste:** Model i końcowy commit poprawne 3/3 (500 t; aktywności 100000/400000 kg). Review pokazuje tylko pierwszy rekord 100 t 3/3. Etykieta jest niepusta.

**Porównanie ze skanem:** F06 live; odrzucenie F07 pozostaje poprawne.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `8e20b525-069a-5469-a857-68a614efcd00`; draft: `5876dafa-3dc7-4578-b824-8f25cbfa7c70`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Preview i odpowiedź przedstawiają500000 kg/500.000 t jako pełny total; etykieta nie jest null/draft-value-no-source. | Model prawidłowo oblicza 500 t, ale proposed_value i UI pokazują tylko Activity A = 100 t. Etykieta jest niepusta: F07 nie odtworzono. | FAIL |
| A2 | Masa CH4= 1000 kg, wkład=28000kgCO2e; nie28000kgCH4 ani84000kgCO2e 100yr. | Model: CH4=1000 kg, GWP100=28, wkład CH4=28000 kg CO2e (syntetyczny zamrożony GWP). | PASS |
| A3 | Po confirm jeden parent ma500000 kg, dwie ActivityValue100000 i400000 kg; parent GasValue CO2= 472000, CH4= 1000,N2O= 0. | CC: parent 500000 kg; ActivityValue 100000 i 400000 kg; parent CO2=472000, CH4=1000, N2O=0. Poziomów grafu nie sumowano podwójnie. | PASS |
| A4 | Results SE=500000 kg, nie100000,556000 ani1000000 kg. | Results API/UI pokazują 500 t, zgodnie z pełnym totalem. | PASS |
| A5 | Przed confirm CC puste, po confirm źródło i historia są powiązane z tym inventory; brak innych celów. | CC puste przed potwierdzeniem; po nim właściwe źródło, GPC i history dla tego inwentarza. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Pokaż pełną emisję SS06-gas-records dla I.1.1 w horyzoncie 100 lat, nie tylko pierwszą aktywność. Ile kg CH4 jest w danych i ile kg CO2e wnosi CH4? Jeszcze nie zapisuj.

**Odpowiedź:**

Dla **I.1.1 — Budynki mieszkalne, Scope 1**, źródło **SS06-gas-records** obejmuje obie aktywności:

- CO₂: 100 000 kg + 372 000 kg = **472 000 kg CO₂e**
- CH₄: **1 000 kg CH₄**
- Wkład CH₄ w horyzoncie 100 lat (GWP 28): **28 000 kg CO₂e**

**Łączna emisja 100-letnia: 500 000 kg CO₂e** (500 t CO₂e).

Nie zapisuję ani nie zatwierdzam tej propozycji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/375db3c8c3d3410c91ad2a715a19177c) · request `cc-1793493914501-fdpyrrqxj` · model `openai/gpt-5.6-terra`.

**Prompt:** Akceptuję źródło SS06-gas-records dla I.1.1; pokaż kartę zapisu do inwentaryzacji.

**Odpowiedź:**

Zaakceptowałem **SS06-gas-records** dla **I.1.1 — budynki mieszkalne, Scope 1**. Karta potwierdzenia zapisu do inwentaryzacji jest teraz gotowa.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/cb12a44671fd4b32a6b385d237df7fe4) · request `cc-1793493934569-pks52jiix` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c2caaf0191ac4f2f8e756a9068c201a6) — request `cc-1793493887584-ywdh1ojin`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e99c4ff9486e4499add976aeb5679e8b) — request `None`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/375db3c8c3d3410c91ad2a715a19177c) — request `cc-1793493914501-fdpyrrqxj`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/cb12a44671fd4b32a6b385d237df7fe4) — request `cc-1793493934569-pks52jiix`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a148a6fa0e0b498b83760e7cf1fc53f8) — request `cc-1793493955361-bokazl00q`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_review_request · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b15ff1b10a45479cba2ebd4798336e31) — request `cc-1793493955361-bokazl00q`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_review · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b87d6c1cdb87427b9b45475ea0f762cc) — request `None`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_review · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d9e5b2dfee804f4abc453358c1e9cd67) — request `None`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/db737b82cdfb4693bfffa1bf64475d62) — request `cc-1793493967826-j4fbi8oax`, draft `5876dafa-3dc7-4578-b824-8f25cbfa7c70`, prompt `None`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `48840959-54bf-5757-a02d-42b25c14fabb`; draft: `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Preview i odpowiedź przedstawiają500000 kg/500.000 t jako pełny total; etykieta nie jest null/draft-value-no-source. | Model prawidłowo oblicza 500 t, ale proposed_value i UI pokazują tylko Activity A = 100 t. Etykieta jest niepusta: F07 nie odtworzono. | FAIL |
| A2 | Masa CH4= 1000 kg, wkład=28000kgCO2e; nie28000kgCH4 ani84000kgCO2e 100yr. | Model: CH4=1000 kg, GWP100=28, wkład CH4=28000 kg CO2e (syntetyczny zamrożony GWP). | PASS |
| A3 | Po confirm jeden parent ma500000 kg, dwie ActivityValue100000 i400000 kg; parent GasValue CO2= 472000, CH4= 1000,N2O= 0. | CC: parent 500000 kg; ActivityValue 100000 i 400000 kg; parent CO2=472000, CH4=1000, N2O=0. Poziomów grafu nie sumowano podwójnie. | PASS |
| A4 | Results SE=500000 kg, nie100000,556000 ani1000000 kg. | Results API/UI pokazują 500 t, zgodnie z pełnym totalem. | PASS |
| A5 | Przed confirm CC puste, po confirm źródło i historia są powiązane z tym inventory; brak innych celów. | CC puste przed potwierdzeniem; po nim właściwe źródło, GPC i history dla tego inwentarza. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Pokaż pełną emisję SS06-gas-records dla I.1.1 w horyzoncie 100 lat, nie tylko pierwszą aktywność. Ile kg CH4 jest w danych i ile kg CO2e wnosi CH4? Jeszcze nie zapisuj.

**Odpowiedź:**

Dla **I.1.1 — Scope 1, budynki mieszkalne** źródło **SS06-gas-records** obejmuje obie aktywności:

- **CO₂:** 100 000 + 372 000 = **472 000 kg CO₂e**  
- **CH₄:** **1 000 kg CH₄**, co przy GWP100 = 28 wnosi **28 000 kg CO₂e**
- **Łącznie w horyzoncie 100 lat:** **500 000 kg CO₂e** (500 tCO₂e)

Nic nie zostało zapisane ani zatwierdzone.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/61574ae91dc44cd2bf1f1d008d12497a) · request `cc-1793493977877-bzgzacmkm` · model `openai/gpt-5.6-terra`.

**Prompt:** Akceptuję źródło SS06-gas-records dla I.1.1; pokaż kartę zapisu do inwentaryzacji.

**Odpowiedź:**

Zaakceptowałem źródło **SS06-gas-records** dla **I.1.1 — budynki mieszkalne, Scope 1**. Karta potwierdzenia zapisu do inwentaryzacji jest teraz wyświetlona.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/adbb249dc02443c28fa0b12691e7b8a3) · request `cc-1793494005448-o013ncjto` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f90bffbae2494ecfba1c09a058398c08) — request `cc-1793493950250-bfvujck99`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/566441b1df234d91b1814294a5adbccb) — request `None`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/61574ae91dc44cd2bf1f1d008d12497a) — request `cc-1793493977877-bzgzacmkm`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/adbb249dc02443c28fa0b12691e7b8a3) — request `cc-1793494005448-o013ncjto`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/eade653795c3409d8617161c08a623d8) — request `cc-1793494028425-d03m11alb`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/bb12cade89674b4994c81f862fa431fa) — request `cc-1793494035775-r6egl14gb`, draft `bce10b17-010a-4c79-aa5a-5a6f2f5d7a8b`, prompt `None`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `a34864b1-a1a1-5280-8df9-70716abffd15`; draft: `2686df2b-f466-428b-b52a-e6cc8fdc3e80`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Preview i odpowiedź przedstawiają500000 kg/500.000 t jako pełny total; etykieta nie jest null/draft-value-no-source. | Model prawidłowo oblicza 500 t, ale proposed_value i UI pokazują tylko Activity A = 100 t. Etykieta jest niepusta: F07 nie odtworzono. | FAIL |
| A2 | Masa CH4= 1000 kg, wkład=28000kgCO2e; nie28000kgCH4 ani84000kgCO2e 100yr. | Model: CH4=1000 kg, GWP100=28, wkład CH4=28000 kg CO2e (syntetyczny zamrożony GWP). | PASS |
| A3 | Po confirm jeden parent ma500000 kg, dwie ActivityValue100000 i400000 kg; parent GasValue CO2= 472000, CH4= 1000,N2O= 0. | CC: parent 500000 kg; ActivityValue 100000 i 400000 kg; parent CO2=472000, CH4=1000, N2O=0. Poziomów grafu nie sumowano podwójnie. | PASS |
| A4 | Results SE=500000 kg, nie100000,556000 ani1000000 kg. | Results API/UI pokazują 500 t, zgodnie z pełnym totalem. | PASS |
| A5 | Przed confirm CC puste, po confirm źródło i historia są powiązane z tym inventory; brak innych celów. | CC puste przed potwierdzeniem; po nim właściwe źródło, GPC i history dla tego inwentarza. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Pokaż pełną emisję SS06-gas-records dla I.1.1 w horyzoncie 100 lat, nie tylko pierwszą aktywność. Ile kg CH4 jest w danych i ile kg CO2e wnosi CH4? Jeszcze nie zapisuj.

**Odpowiedź:**

Dla **SS06-gas-records** w wierszu **I.1.1 (budynki mieszkalne, Scope 1)** pełne dane źródłowe obejmują dwie aktywności:

- CO₂: 100 000 kg + 372 000 kg  
- CH₄: **1 000 kg**, co przy GWP100 = 28 wnosi **28 000 kg CO₂e**

Łączna emisja w horyzoncie 100 lat wynosi więc **500 000 kg CO₂e** (500 t CO₂e).

Widoczna propozycja w panelu pokazuje obecnie tylko pierwszą aktywność, czyli 100 000 kg CO₂e. Nic nie zostało zapisane ani zatwierdzone.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/35e6e70717da45e89496f946522befd8) · request `cc-1793494019372-vm6xyilpc` · model `openai/gpt-5.6-terra`.

**Prompt:** Akceptuję źródło SS06-gas-records dla I.1.1; pokaż kartę zapisu do inwentaryzacji.

**Odpowiedź:**

Zaakceptowałem źródło **SS06-gas-records** dla **I.1.1 — budynki mieszkalne, Scope 1**. Karta potwierdzenia zapisu do inwentaryzacji jest teraz wyświetlona — zatwierdź ją, aby zapisać ten wiersz.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/21de5e560afc4f3eaa767e823733bfe5) · request `cc-1793494037204-zf0to1qu5` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b87df00057fb48dc84216603fcf9eb0f) — request `cc-1793494004873-micxw32c9`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/894e11cba70542778f4e8c9f1f37e074) — request `None`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/35e6e70717da45e89496f946522befd8) — request `cc-1793494019372-vm6xyilpc`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/21de5e560afc4f3eaa767e823733bfe5) — request `cc-1793494037204-zf0to1qu5`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c1bbeb88437f404d981ee3f1d000c4f1) — request `cc-1793494057198-t5ighm29m`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/70a3e02af0e04aa2a2396dd245051570) — request `cc-1793494061249-36xhqf6df`, draft `2686df2b-f466-428b-b52a-e6cc8fdc3e80`, prompt `None`.

