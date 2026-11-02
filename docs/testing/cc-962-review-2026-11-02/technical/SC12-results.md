# SC12 — SE: restart procesu CA w trakcie generowania draftu i ponowienie

Wynik: **0/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=0/3 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Własna replika CA o tym samym digest, 6 syntetycznych źródeł, 21 celów GPC. Opóźnienia 5 s źródło /45 s background-create MLflow tworzą okno kontrolowanego restartu.

**Oczekiwane:** Po utracie procesu odzyskać stan; retry pojedynczy, bez duplikatów.

**Rzeczywiste:** Po 600 s status generating i spinner 3/3. Dwa retry 200 ms od siebie zwracają 200/200; po zakończeniu 42 propozycje dla 21 unikalnych celów 3/3. Brak zapisów CC.

**Porównanie ze skanem:** F09 live i dodatkowy brak single-flight retry. Restartowano wyłącznie własne instancje, nigdy wspólny CA. To nie jest test równoległego save.

## Próba 1 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `2dd086f8-7f84-54d0-8704-9c82144cd6bd`; draft: `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO14-A1 | Wyjście z generating | Po 600 s od zatrzymania status nadal generating. | FAIL |
| SO14-A2 | Stan UI | UI przez całe 10 min pokazuje drafting/spinner bez odzyskania. To okno harnessu, nie istniejące SLA produktu. | FAIL |
| SO14-A3 | Wynik po retry | Po obu retry: 42 propozycje / 21 różnych celów GPC. Oczekiwano 21 / 21. | FAIL |
| SO14-A4 | Single-flight retry | Oba retry HTTP [200, 200], odległość startów 0.203 s. Dwa workery wytworzyły duplikaty; retry nie jest single-flight. | FAIL |
| SO14-A5 | CC nietknięte | Brak zapisów danych CC i history. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7ce5bd73efb048288e722a14034a21f4) — request `cc962-SC12-r1-1793494211762`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/924c205519ee45d98eb8fcfa0d5baf60) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d399dc50acf3436daf3490ac444a8999) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b17cdac29dd44951b81a688aad78eaae) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dfd4ad8347004d9d91efb620f21557ba) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f77b9b553b6947188ee7f4d2d329dd44) — request `cc962-SC12-r1-retry-1-1793494835579`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6b03bb35c59742f583fcb8fb85daacbb) — request `cc962-SC12-r1-retry-2-1793494835782`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6009a2992e3c4f398ed804ab9216a771) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c7b72f6d4b1c4e9f9d16a1076cc7d5bd) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/014234a499794c1ab3bc50630b6e6a8b) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/05260df2b45a4374849d8a0645eefdf9) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/74300cf57c894b32ad40e883384ba3f7) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/77f1adc03e534595b381ad86dd0f1e90) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7772417303f34af7b8084775fb055197) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9d49cc1e341f48aeb8abdd734ba26ff8) — request `None`, draft `245f3075-17d2-4a9b-9bbe-d315b9dba9c0`, prompt `None`.

## Próba 2 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `45cf52f1-d644-54e3-91a3-99ca50f396c0`; draft: `f262d347-b76b-406c-9368-890a6221f688`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO14-A1 | Wyjście z generating | Po 600 s od zatrzymania status nadal generating. | FAIL |
| SO14-A2 | Stan UI | UI przez całe 10 min pokazuje drafting/spinner bez odzyskania. To okno harnessu, nie istniejące SLA produktu. | FAIL |
| SO14-A3 | Wynik po retry | Po obu retry: 42 propozycje / 21 różnych celów GPC. Oczekiwano 21 / 21. | FAIL |
| SO14-A4 | Single-flight retry | Oba retry HTTP [200, 200], odległość startów 0.202 s. Dwa workery wytworzyły duplikaty; retry nie jest single-flight. | FAIL |
| SO14-A5 | CC nietknięte | Brak zapisów danych CC i history. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/def5e51128cf4e37b0f8c1fbe3afd572) — request `cc962-SC12-r2-1793494328928`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/396bce1d6d6b4278b9546161a89be0cf) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5bb7fd1c734a4f738d00d97bcc285b6f) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/39f124ed96b2414a9f54fb0caf55c5b7) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/aa60fdb30e3c4f15b3ebc2905caa1f5c) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/49563acc85f44220b94141c844f5f21f) — request `cc962-SC12-r2-retry-1-1793494947644`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/278dd2b594e24f3e8a1b74aa0a785b81) — request `cc962-SC12-r2-retry-2-1793494947846`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/3e0779be27c845ffa75d707c856199a7) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c3161ac7b1d24f24b5788ff4583b5d79) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/70b128aab283427bbb99968bfe33cb72) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a2180800e4b945a397ac7971b144c4bf) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4af2baa208fb48f8adbfd5aa408c3dc2) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a7a34c173d3f42c0a2b0a79741db9473) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d6c369f5c51c4bd8a6891b225bf0bb60) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/fa8bc5dd36d44466adaff1df90235a30) — request `None`, draft `f262d347-b76b-406c-9368-890a6221f688`, prompt `None`.

## Próba 3 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `5510edc1-d6e6-5b8f-8507-6ed86fac88ef`; draft: `1a1c9856-1560-40c7-9823-9574b6e5101e`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO14-A1 | Wyjście z generating | Po 600 s od zatrzymania status nadal generating. | FAIL |
| SO14-A2 | Stan UI | UI przez całe 10 min pokazuje drafting/spinner bez odzyskania. To okno harnessu, nie istniejące SLA produktu. | FAIL |
| SO14-A3 | Wynik po retry | Po obu retry: 42 propozycje / 21 różnych celów GPC. Oczekiwano 21 / 21. | FAIL |
| SO14-A4 | Single-flight retry | Oba retry HTTP [200, 200], odległość startów 0.203 s. Dwa workery wytworzyły duplikaty; retry nie jest single-flight. | FAIL |
| SO14-A5 | CC nietknięte | Brak zapisów danych CC i history. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c5c0c5f561ee4ec08a56f8561a11bef3) — request `cc962-SC12-r3-1793494339087`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f89668ffc1f6431fb04c4ee35245d6b4) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/fe295e5637c541f1b5b363a89624af90) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/218ae58926654f05894444d46cd6e8ad) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4fff3a1b32ad4e8081529bdd28219e09) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2d268359f1f24be58f4a70852b38cf4c) — request `cc962-SC12-r3-retry-1-1793494958445`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_retry_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/55abbf5770b84c6d9469f61fb6abf0c4) — request `cc962-SC12-r3-retry-2-1793494958647`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dc4ce8fefed1408d849119cdf408ad6a) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dca5c6fe09624f58a58d5371243e3431) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9adeadc59b9b4618a67f4741362b8cc0) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/fc7e5da6cd0d4ce7b6fbfe399f15e15d) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/28f2062791a24236a268ec19512e00c5) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation_background · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/73051f6d6dd24584af6c48f02e189c8a) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/18c52f2bbb4c4fd28d23c5c9008581b3) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.
- [stationary_energy_draft_generation · RUNNING](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d00b77d598734ed5bcab989325ba417b) — request `None`, draft `1a1c9856-1560-40c7-9823-9574b6e5101e`, prompt `None`.

