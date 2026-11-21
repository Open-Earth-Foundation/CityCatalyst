# SC11 — SE: częściowa awaria dwufazowego zapisu (faza 1 OK, faza 2 notation-keys 503) i ponowienie

Wynik: **0/3** zaliczonych prób. GE=3, UW-kontrakt=3, PV=0. DA=0/9 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Źródło 200000 kg I.1.1 + NE I.5.1. Izolowany CA; proxy zwraca jednorazowe 503 drugiej fazy notation commit.

**Oczekiwane:** CC i CA uzgadniają częściowy zapis; retry nie zastępuje już zapisanej wartości i nie gubi audytu.

**Rzeczywiste:** Pierwsze save HTTP500: CC ma już 200000 kg, CA pending, model zaprzecza zapisowi 3/3. Retry200 kończy zapis, lecz zmienia value ID bez historii usunięcia 3/3.

**Porównanie ze skanem:** F08/F13 live. Rzeczywiste CA API i wspólne UI obserwujące stan; pełna ścieżka kliknięcia błędu na wspólnym CA nie była testowana.

## Próba 1 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](https://github.com/user-attachments/assets/e849129e-2b68-4f97-9efc-e7dfae724cd5) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `8bba830d-08bf-5f0e-8840-cbdb6012fade`; draft: `61975963-2b3f-406e-8833-15e9742d8c9f`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO13-A1 | Stan CA po awarii | Po 503 drugiej fazy CC ma 200000 kg, ale CA cofa źródłowy commit do pending_cc_commit. | FAIL |
| SO13-A2 | Stan CC po awarii | S1: I.1.1 jest zapisany (200000 kg); I.5.1 bez NE. To kontrolny fakt diagnostyczny, nie kryterium jakości. | OBSERVED |
| SO13-A3 | Odpowiedź agenta zgodna z CC | P2 odpowiada „Nie / żaden wiersz nie został zapisany”, mimo 200000 kg w CC. Test używa izolowanego CA API; wspólny dev UI jest obserwatorem. | FAIL |
| SO13-A4 | Idempotentne ponowienie | Retry zmienia parent id c515890a-3adf-4e26-b6e2-0f34e8b96816 → d0c129c8-f122-4d49-9881-5aeb83f1a3dc; create entries=2. NE finalnie się zapisuje. | FAIL |
| SO13-A5 | Brak niewersjonowanego usunięcia | Brak isDeleted=true dla starego parenta mimo zastąpienia go nowym ID. | FAIL |
| SO13-A6 | Stan końcowy | Stan końcowy saved; obie właściwe decyzje committed. Wartość końcowa 200000 kg, NE obecne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz do inwentarza.

**Odpowiedź:**

Wyświetliłem potwierdzenie zapisu. Do inwentarza są gotowe 2 pozycje: jedna z wybranego źródła i jedna z kluczem notacji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c7dfd3e8c77c4f7d8ba93b82d5b9a741) · request `cc-1793494695373-5oy8jn2pv` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy coś zostało zapisane do inwentarza?

**Odpowiedź:**

Nie. Wyświetlono jedynie prośbę o potwierdzenie — 2 gotowe pozycje nie zostały jeszcze zapisane do inwentarza.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/bfca1f46673a4689ae5808a6af8b48d4) · request `cc-1793494723717-eh03wt9ht` · model `openai/gpt-5.6-terra`.

**Prompt:** Spróbuj zapisać ponownie.

**Odpowiedź:**

Ponownie wyświetliłem prośbę o potwierdzenie zapisu. Do inwentarza mogą zostać zapisane 2 gotowe pozycje: jedna ze źródła i jedna z kluczem notacji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6cc63eedbbee4ee1b35777ddc5fa6b71) · request `cc-1793494734151-4o1h3keza` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c8f45e4e23bc4a7fbfb71cb6bda7303f) — request `cc-1793494685980-9pyixecg6`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c7dfd3e8c77c4f7d8ba93b82d5b9a741) — request `cc-1793494695373-5oy8jn2pv`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FAILED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/0d6b08f7471844e4bbdb4025e8d6e77a) — request `cc962-SC11-r1-1793494710042`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/bfca1f46673a4689ae5808a6af8b48d4) — request `cc-1793494723717-eh03wt9ht`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6cc63eedbbee4ee1b35777ddc5fa6b71) — request `cc-1793494734151-4o1h3keza`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/199d9184969842d6ab6d85ed724586e3) — request `cc962-SC11-r1-1793494748767`, draft `61975963-2b3f-406e-8833-15e9742d8c9f`, prompt `None`.

## Próba 2 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](https://github.com/user-attachments/assets/0588cedb-c483-4cf7-87c8-b3fa1f010e7e) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `4bef5ced-fab2-5b28-9bea-7ce252824b22`; draft: `875eef37-8647-4e6c-bb58-5ec55023cf16`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO13-A1 | Stan CA po awarii | Po 503 drugiej fazy CC ma 200000 kg, ale CA cofa źródłowy commit do pending_cc_commit. | FAIL |
| SO13-A2 | Stan CC po awarii | S1: I.1.1 jest zapisany (200000 kg); I.5.1 bez NE. To kontrolny fakt diagnostyczny, nie kryterium jakości. | OBSERVED |
| SO13-A3 | Odpowiedź agenta zgodna z CC | P2 odpowiada „Nie / żaden wiersz nie został zapisany”, mimo 200000 kg w CC. Test używa izolowanego CA API; wspólny dev UI jest obserwatorem. | FAIL |
| SO13-A4 | Idempotentne ponowienie | Retry zmienia parent id e8d60223-bd2d-43d1-a92b-b1a4ba5dcc37 → f8f03a66-6cab-444c-8d5b-ebf0bf956eeb; create entries=2. NE finalnie się zapisuje. | FAIL |
| SO13-A5 | Brak niewersjonowanego usunięcia | Brak isDeleted=true dla starego parenta mimo zastąpienia go nowym ID. | FAIL |
| SO13-A6 | Stan końcowy | Stan końcowy saved; obie właściwe decyzje committed. Wartość końcowa 200000 kg, NE obecne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz do inwentarza.

**Odpowiedź:**

Wyświetliłem potwierdzenie zapisu. Do inwentarza są gotowe: 1 wiersz ze źródłem oraz 1 wiersz z kluczem notacyjnym.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7753f58a7fff4f8ea467dd3db5d8443f) · request `cc-1793494695333-3irf8nqx9` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy coś zostało zapisane do inwentarza?

**Odpowiedź:**

Nie. Wciąż oczekuje na zatwierdzenie w karcie potwierdzenia, więc żaden wiersz nie został jeszcze zapisany do inwentarza.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/849bab0405c8428789c489771895e5ad) · request `cc-1793494723273-e6js79gf6` · model `openai/gpt-5.6-terra`.

**Prompt:** Spróbuj zapisać ponownie.

**Odpowiedź:**

Wyświetliłem ponownie potwierdzenie zapisu. Gotowe są 2 wiersze: 1 ze źródłem danych i 1 z kluczem notacyjnym.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a7fb114170644c7a94eaf78164ccfcb9) · request `cc-1793494734115-1ej1n71ct` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a7e138b9e90a4f1b9c26b5f07be04ee0) — request `cc-1793494686284-wiapfe04i`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7753f58a7fff4f8ea467dd3db5d8443f) — request `cc-1793494695333-3irf8nqx9`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FAILED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/4a47d427609147b997f1b26a3f0b9fc1) — request `cc962-SC11-r2-1793494709990`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/849bab0405c8428789c489771895e5ad) — request `cc-1793494723273-e6js79gf6`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a7fb114170644c7a94eaf78164ccfcb9) — request `cc-1793494734115-1ej1n71ct`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/731e6ca2b3f74c9ea11e932845c7c829) — request `cc962-SC11-r2-1793494748730`, draft `875eef37-8647-4e6c-bb58-5ec55023cf16`, prompt `None`.

## Próba 3 · FAIL

Zakres: API isolation + shared dev UI observer. [Nagranie MP4](https://github.com/user-attachments/assets/140bd5ea-3923-4807-87f0-74a431371c31) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `55280389-efb1-5525-b8d6-431004880512`; draft: `0e9a7591-bced-41e9-94d9-b6e00e57e270`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO13-A1 | Stan CA po awarii | Po 503 drugiej fazy CC ma 200000 kg, ale CA cofa źródłowy commit do pending_cc_commit. | FAIL |
| SO13-A2 | Stan CC po awarii | S1: I.1.1 jest zapisany (200000 kg); I.5.1 bez NE. To kontrolny fakt diagnostyczny, nie kryterium jakości. | OBSERVED |
| SO13-A3 | Odpowiedź agenta zgodna z CC | P2 odpowiada „Nie / żaden wiersz nie został zapisany”, mimo 200000 kg w CC. Test używa izolowanego CA API; wspólny dev UI jest obserwatorem. | FAIL |
| SO13-A4 | Idempotentne ponowienie | Retry zmienia parent id 65e5035d-2f0b-4a30-b27a-e5684ba88653 → 1ace8676-164b-4fd5-a007-8b676f8d7b6a; create entries=2. NE finalnie się zapisuje. | FAIL |
| SO13-A5 | Brak niewersjonowanego usunięcia | Brak isDeleted=true dla starego parenta mimo zastąpienia go nowym ID. | FAIL |
| SO13-A6 | Stan końcowy | Stan końcowy saved; obie właściwe decyzje committed. Wartość końcowa 200000 kg, NE obecne. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz do inwentarza.

**Odpowiedź:**

Przygotowałem potwierdzenie zapisu do inwentarza: obejmuje 1 wartość ze źródła oraz 1 klucz notacyjny. Potwierdź je w wyświetlonej karcie, aby kontynuować.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/88d8a125dc274ba88b36520cb450ecba) · request `cc-1793494624689-skf4t2t6i` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy coś zostało zapisane do inwentarza?

**Odpowiedź:**

Nie. Zapis do inwentarza nie został jeszcze wykonany — oczekuje na Twoje potwierdzenie w karcie zapisu. Po potwierdzeniu zostaną zapisane 2 pozycje: 1 wartość źródłowa i 1 klucz notacyjny.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c47ccf2a014648aeb13b01ada0ff8cdb) · request `cc-1793494650278-p5900btas` · model `openai/gpt-5.6-terra`.

**Prompt:** Spróbuj zapisać ponownie.

**Odpowiedź:**

Ponownie wyświetliłem potwierdzenie zapisu do inwentarza. Potwierdź je w karcie — do zapisu są 2 pozycje: 1 wartość ze źródła i 1 klucz notacyjny.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/19be9c96db80455b9402e531a9f32db8) · request `cc-1793494663155-ik3gneo9t` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ae221e4b86c548c2b09a0dbb2e74831a) — request `cc-1793494608089-fj7oelxfk`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/37fded115ef742fa819d84f9d8e51e79) — request `None`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `None`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ab09175ca7eb455d87613a6894736edb) — request `cc-1793494617280-gxdv1yrsk`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/88d8a125dc274ba88b36520cb450ecba) — request `cc-1793494624689-skf4t2t6i`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FAILED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c0e2f10128cb4e3da61eb6504d637b61) — request `cc962-SC11-r3-1793494637877`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c47ccf2a014648aeb13b01ada0ff8cdb) — request `cc-1793494650278-p5900btas`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/19be9c96db80455b9402e531a9f32db8) — request `cc-1793494663155-ik3gneo9t`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ad1647e16e7f4569ba358e467a3f5c9d) — request `cc962-SC11-r3-1793494677878`, draft `0e9a7591-bced-41e9-94d9-b6e00e57e270`, prompt `None`.
