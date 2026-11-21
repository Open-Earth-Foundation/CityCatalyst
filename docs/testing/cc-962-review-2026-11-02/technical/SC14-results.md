# SC14 — SE: użytkownik spoza organizacji nie może uruchomić draftu ani zapisać do PUBLICZNEGO inwentarza

Wynik: **0/3** zaliczonych prób. GE=0, UW-kontrakt=3, PV=9. DA=0/0 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Zalogowany A spoza org B, opublikowany/public B 2024, syntetyczne źródło 200000 kg. Public flag ustawiona fixture w DB.

**Oczekiwane:** UI/API nie przyznają non-member prawa start/review/commit.

**Rzeczywiste:** UI blokuje/odsyła do własnego miasta; model na SE nieuruchomiony. Bezpośrednie API: start201, review200, save200; w B zapisane 200000 kg i historia z autorem A 3/3.

**Porównanie ze skanem:** F16 live. 9 zabronionych działań i 3 celowe adversarial API writes; nie są to samoczynne zapisy modelu.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/415c3515-f313-4390-891d-059f6eacfccf) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `93ae1525-7bcb-5977-a05f-77096295925b`; draft: `dc741958-93c0-4481-af65-37896219bcd1`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO12-A1 | Start odrzucony | Niezależny użytkownik otrzymuje start HTTP 201; powstaje draft. | FAIL |
| SO12-A2 | Brak zapisu w CC | Review i save API przyjęte; CC ma [('200000', 'I.1.1')], a history wskazuje nie-członka jako autora. | FAIL |
| SO12-A3 | Model nie oferuje edycji | Strona SE nie była osiągalna dla nie-członka; model na tej stronie nie został uruchomiony. Brak wyniku modelu, nie PASS. | NOT_APPLICABLE |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8944e8455feb4e59a907e37fa214ba63) — request `cc-1793494512259-hybpfmqkp`, draft `dc741958-93c0-4481-af65-37896219bcd1`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ed5aca0ade754dd7a152b1c85ebdb4ce) — request `None`, draft `dc741958-93c0-4481-af65-37896219bcd1`, prompt `None`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8f7642f2b4c84842b4b7e5e905befdde) — request `cc-1793494527832-v2d6utrgv`, draft `dc741958-93c0-4481-af65-37896219bcd1`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/acd6c8f8c2c64306a28f31bf32b34fb8) — request `cc-1793494536218-r4ct2ucb5`, draft `dc741958-93c0-4481-af65-37896219bcd1`, prompt `None`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/22761914-52a0-45ae-9b7c-16003fd1c75e) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `b3420ec8-808f-5c29-9204-697c9ca597ed`; draft: `bb9bd5e8-13e5-4c7a-9053-8b760bb477f6`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO12-A1 | Start odrzucony | Niezależny użytkownik otrzymuje start HTTP 201; powstaje draft. | FAIL |
| SO12-A2 | Brak zapisu w CC | Review i save API przyjęte; CC ma [('200000', 'I.1.1')], a history wskazuje nie-członka jako autora. | FAIL |
| SO12-A3 | Model nie oferuje edycji | Strona SE nie była osiągalna dla nie-członka; model na tej stronie nie został uruchomiony. Brak wyniku modelu, nie PASS. | NOT_APPLICABLE |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/e59f4421726144caa08c2bf4897c1025) — request `cc-1793494512483-r91375htq`, draft `bb9bd5e8-13e5-4c7a-9053-8b760bb477f6`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a953b93f86ff4ddfa6b8eb9775eeb1dd) — request `None`, draft `bb9bd5e8-13e5-4c7a-9053-8b760bb477f6`, prompt `None`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/472ddc38dd3940a295528f199d84a48a) — request `cc-1793494527956-qs2pvc39j`, draft `bb9bd5e8-13e5-4c7a-9053-8b760bb477f6`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/3f9e032fe3614b03a82c32afd354cd3c) — request `cc-1793494536207-335pov502`, draft `bb9bd5e8-13e5-4c7a-9053-8b760bb477f6`, prompt `None`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/01ec0a75-4fbf-4e92-a60e-7a8183311de4) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `9faa321c-526c-5200-8706-461d9f0b14fb`; draft: `10918a43-b8d2-4dad-961e-41abc481429e`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO12-A1 | Start odrzucony | Niezależny użytkownik otrzymuje start HTTP 201; powstaje draft. | FAIL |
| SO12-A2 | Brak zapisu w CC | Review i save API przyjęte; CC ma [('200000', 'I.1.1')], a history wskazuje nie-członka jako autora. | FAIL |
| SO12-A3 | Model nie oferuje edycji | Strona SE nie była osiągalna dla nie-członka; model na tej stronie nie został uruchomiony. Brak wyniku modelu, nie PASS. | NOT_APPLICABLE |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

Brak odpowiedzi modelu w tej próbie; kontrola backendu/API, GE nie jest zerem zmierzonym dla modelu.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/99b7431fd74a4cde98fad8ca960f3d6a) — request `cc-1793494574263-1rnsj1ef3`, draft `10918a43-b8d2-4dad-961e-41abc481429e`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/91bf99a7347940f58554392c74a355ee) — request `None`, draft `10918a43-b8d2-4dad-961e-41abc481429e`, prompt `None`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/97cfc81d2c304822a8f9e0fe92e38dbf) — request `cc-1793494584538-sdrvf8jx3`, draft `10918a43-b8d2-4dad-961e-41abc481429e`, prompt `None`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9af0ca80dc364b91a4956d8a3badfb7a) — request `cc-1793494588449-1iiljuflj`, draft `10918a43-b8d2-4dad-961e-41abc481429e`, prompt `None`.
