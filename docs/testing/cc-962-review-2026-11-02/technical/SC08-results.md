# SC08 — Konflikt źródeł mimo identycznego pierwszego gazowego rekordu

Wynik: **0/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=6/6 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Źródło A: 100000+400000=500000 kg; B: 100000+900000=1000000 kg. Pierwsze rekordy identyczne.

**Oczekiwane:** Wykryć różnicę pełnych sum 500 t / 1000 t, konflikt i brak automatycznego zwycięzcy.

**Rzeczywiste:** Model poprawnie porównuje sumy, delta 500 t /100%, bez stage/commit. Backend ma needs_review zamiast conflict i automatycznie rekomenduje B, UI pokazuje po 100 t. Rekomendacja nie jest zapisem ani wyborem użytkownika.

**Porównanie ze skanem:** F06 — wariant konfliktu live.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `a2e55f8d-a04f-5f09-a293-b6dcd255e213`; draft: `27b6873e-3967-4ee2-ae98-78aca304b56e`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Proposal dla I.1.1 ma conflict, a nie needs_review/gap/ready. | Proposal ma status needs_review, zamiast conflict; UI porównuje po 100 t z pierwszej aktywności. | FAIL |
| A2 | Oba totale odpowiedzi to500000 i1000000 kg; delta500000kg=500.000 t. | Odpowiedź prawidłowa: źródła 500 t i 1000 t; różnica 500 t. | PASS |
| A3 | Wzrost względem A wynosi 100.00%, tolerancja0.01pp. | Model prawidłowo podaje +100% względem A. | PASS |
| A4 | Brak automatycznego winnera/stagingu i CC write. | Literalny oracle „bez automatycznego winnera” nie spełniony: istnieje automatyczna rekomendacja kandydata, oparta na pozornie równych pierwszych rekordach. Rekomendacja nie stała się wyborem użytkownika: CA staging i CC write nadal 0. Nie liczymy jej jako UW. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Porównaj SS07-A i SS07-B dla I.1.1. Czy całe źródła się zgadzają? Podaj oba totale, różnicę w tonach i różnicę procentową względem SS07-A. Niczego nie wybieraj za mnie.

**Odpowiedź:**

Dla **I.1.1 — budynki mieszkalne, spalanie paliw (Scope 1)** źródła **nie są zgodne w całości**:

- **SS07-A:** 500 tCO₂e łącznie  
  - Activity A: 100 tCO₂e  
  - Activity B: 400 tCO₂e
- **SS07-B:** 1 000 tCO₂e łącznie  
  - Activity A: 100 tCO₂e  
  - Activity B: 900 tCO₂e

**Różnica:** 500 tCO₂e  
**Różnica względem SS07-A:** **+100%**

Zgadzają się dla *Activity A*, ale różnią się dla *Activity B*. Nie wybrałem żadnego źródła.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/59605c0b66944c34b40b9ddaf39f2a35) · request `cc-1793494077626-ll1t4oofz` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/70250656e2024c1989329006f2198368) — request `cc-1793494066815-fu734onan`, draft `27b6873e-3967-4ee2-ae98-78aca304b56e`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f5b65bb51313428d9787802a0d04a11b) — request `None`, draft `27b6873e-3967-4ee2-ae98-78aca304b56e`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/59605c0b66944c34b40b9ddaf39f2a35) — request `cc-1793494077626-ll1t4oofz`, draft `27b6873e-3967-4ee2-ae98-78aca304b56e`, prompt `stationary_energy_review`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `a2c140f8-e193-5617-bd52-4cea3f04174f`; draft: `9b58a087-98c3-44b0-93c7-3b406d29ba59`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Proposal dla I.1.1 ma conflict, a nie needs_review/gap/ready. | Proposal ma status needs_review, zamiast conflict; UI porównuje po 100 t z pierwszej aktywności. | FAIL |
| A2 | Oba totale odpowiedzi to500000 i1000000 kg; delta500000kg=500.000 t. | Odpowiedź prawidłowa: źródła 500 t i 1000 t; różnica 500 t. | PASS |
| A3 | Wzrost względem A wynosi 100.00%, tolerancja0.01pp. | Model prawidłowo podaje +100% względem A. | PASS |
| A4 | Brak automatycznego winnera/stagingu i CC write. | Literalny oracle „bez automatycznego winnera” nie spełniony: istnieje automatyczna rekomendacja kandydata, oparta na pozornie równych pierwszych rekordach. Rekomendacja nie stała się wyborem użytkownika: CA staging i CC write nadal 0. Nie liczymy jej jako UW. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Porównaj SS07-A i SS07-B dla I.1.1. Czy całe źródła się zgadzają? Podaj oba totale, różnicę w tonach i różnicę procentową względem SS07-A. Niczego nie wybieraj za mnie.

**Odpowiedź:**

Dla **I.1.1 – budynki mieszkalne, Scope 1** źródła **nie zgadzają się w całości**:

| Źródło | Łącznie |
|---|---:|
| **SS07-A** | **500 tCO₂e** |
| **SS07-B** | **1 000 tCO₂e** |

- **Różnica:** **500 tCO₂e**
- **Różnica względem SS07-A:** **+100%**

Oba źródła podają zgodne **100 tCO₂e** dla „Activity A”, ale różnią się dla „Activity B”: SS07-A podaje **400 tCO₂e**, a SS07-B **900 tCO₂e**. Nic nie zostało wybrane ani zapisane.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/beaf7fb86f5b47aaa3bf8621d301c408) · request `cc-1793494098008-5tkhqryoj` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8e43f1ec24c4418b907d3e14f505e917) — request `cc-1793494085550-ngd4kjrx3`, draft `9b58a087-98c3-44b0-93c7-3b406d29ba59`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/74aca7666e0a4f37b760cfaed1f7b958) — request `None`, draft `9b58a087-98c3-44b0-93c7-3b406d29ba59`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/beaf7fb86f5b47aaa3bf8621d301c408) — request `cc-1793494098008-5tkhqryoj`, draft `9b58a087-98c3-44b0-93c7-3b406d29ba59`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `1c3bea5a-fcfc-59e5-9726-247e7e7428ad`; draft: `38639faf-3b73-42a5-8629-611167e76d8d`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Proposal dla I.1.1 ma conflict, a nie needs_review/gap/ready. | Proposal ma status needs_review, zamiast conflict; UI porównuje po 100 t z pierwszej aktywności. | FAIL |
| A2 | Oba totale odpowiedzi to500000 i1000000 kg; delta500000kg=500.000 t. | Odpowiedź prawidłowa: źródła 500 t i 1000 t; różnica 500 t. | PASS |
| A3 | Wzrost względem A wynosi 100.00%, tolerancja0.01pp. | Model prawidłowo podaje +100% względem A. | PASS |
| A4 | Brak automatycznego winnera/stagingu i CC write. | Literalny oracle „bez automatycznego winnera” nie spełniony: istnieje automatyczna rekomendacja kandydata, oparta na pozornie równych pierwszych rekordach. Rekomendacja nie stała się wyborem użytkownika: CA staging i CC write nadal 0. Nie liczymy jej jako UW. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Porównaj SS07-A i SS07-B dla I.1.1. Czy całe źródła się zgadzają? Podaj oba totale, różnicę w tonach i różnicę procentową względem SS07-A. Niczego nie wybieraj za mnie.

**Odpowiedź:**

Nie, **całe źródła nie są zgodne** dla I.1.1.

| Źródło | Total emisji |
|---|---:|
| **SS07-A** | **500 tCO₂e** |
| **SS07-B** | **1 000 tCO₂e** |

- **Różnica:** **500 tCO₂e**
- **Różnica względem SS07-A:** **100%** wyżej w SS07-B

Oba źródła zgadzają się dla *Activity A* (100 tCO₂e), ale różnią się dla *Activity B*: SS07-A podaje 400 tCO₂e, a SS07-B 900 tCO₂e. Nie wybieram żadnego źródła.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/3571cc96604f474ea4ed3ad1e0ac76f0) · request `cc-1793494119502-ezdtljpm1` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/1815baba58474ce1b3e3f52e7ad1f422) — request `cc-1793494104895-mthbanvg0`, draft `38639faf-3b73-42a5-8629-611167e76d8d`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/46956114758a4fd7b137d41176ab4463) — request `None`, draft `38639faf-3b73-42a5-8629-611167e76d8d`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/3571cc96604f474ea4ed3ad1e0ac76f0) — request `cc-1793494119502-ezdtljpm1`, draft `38639faf-3b73-42a5-8629-611167e76d8d`, prompt `stationary_energy_review`.

