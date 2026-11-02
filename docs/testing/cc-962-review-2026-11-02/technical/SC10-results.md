# SC10 — Wartość dopisana po draftcie przetrwa błąd pobrania zamiennika

Wynik: **0/3** zaliczonych prób. GE=2, UW-kontrakt=3, PV=0. DA=0/6 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Draft dla pustego celu, źródło 120000 kg. Uprawniony współpracownik dopisuje w UI 75000 kg; jednorazowy source-fetch 503 po przygotowaniu karty.

**Oczekiwane:** Zachować nowe 75000 kg; przy błędzie nie usuwać starego grafu; uzgodnić stan i historię.

**Rzeczywiste:** Wartość 75000 kg znika przed pobraniem zamiennika; po 503 cel pusty 3/3, bez rollbacku i wpisu o usunięciu. Dwie odpowiedzi błędnie twierdzą, że wcześniejszej wartości nie było.

**Porównanie ze skanem:** F01 live; 3 nieuzgodnione destrukcyjne mutacje.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `977abed0-084d-52ba-9fa7-8dc1482bf378`; draft: `6e290240-071d-41cd-a4d8-813c209bd274`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Trigger jest realny: draft utworzony dla pustego celu przed UI zapisem75000 kg. | Draft powstał dla pustego celu; odrębna sesja współpracownika wprowadziła 75000 kg przez UI przed potwierdzeniem. | PASS |
| A2 | Po próbie ta sama InventoryValue.id nadal ma75000 kg oraz te same Activity/GasValue i datasource metadata. | Przed awarią: [('f12de4ab-9d46-4a69-b859-a82a60f58a5b', '75000')]; po niej: []. Wartość została usunięta. | FAIL |
| A3 | Po S1 nie powstało usunięcie, zastąpienie ani nowa history version. | Graf danych zmienił się po S1. Nie wykonano wersjonowanego usunięcia utraconej wartości. | FAIL |
| A4 | CC/CA/UI raportują konflikt lub błąd bez twierdzenia o udanym zapisie120000 kg; P3 podaje 75.000 t. | Źródło nie zostało poprawnie zastosowane, lecz dotychczasowe 75000 kg zniknęło. P3 nie potwierdza wymaganych 75 t; w próbach 2/3 błędnie zaprzecza istnieniu poprzedniej wartości. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Wybierz SS11-replacement dla I.1.1, ale na razie nie zapisuj do inwentaryzacji.

**Odpowiedź:**

Wybrałem **SS11-replacement** dla **I.1.1 — budynki mieszkalne, Scope 1**. Wybór jest tylko etapowany w wersji roboczej i **nie został zapisany do inwentaryzacji**.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d8bdc1b4201542c8894b40dee666012d) · request `cc-1793495437600-xpu4n0v9z` · model `openai/gpt-5.6-terra`.

**Prompt:** Zapisz zaakceptowany szkic do inwentaryzacji; pokaż kartę potwierdzenia.

**Odpowiedź:**

Wyświetliłem kartę potwierdzenia zapisu zaakceptowanego wiersza do inwentaryzacji. Zatwierdź ją w interfejsie, aby wykonać zapis.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dbf0623d89894717b3932efdd907e20a) · request `cc-1793495477843-80wbnevfk` · model `openai/gpt-5.6-terra`.

**Prompt:** Operacja nie doszła do skutku. Odczytaj bieżącą emisję i powiedz, czy wcześniejsza wartość w inwentaryzacji została zachowana.

**Odpowiedź:**

Nie mogę potwierdzić bieżącej emisji w inwentaryzacji z dostępnego szkicu — w chwili przygotowania szkicu wiersz **I.1.1** był pusty.

Wybór źródła **SS11-replacement** zawierał propozycję **120 000 kg CO₂**, ale zapis do inwentaryzacji zakończył się niepowodzeniem. Nie ma potwierdzenia udanego zapisu, więc ta proponowana wartość nie została zastosowana; wcześniejszy stan inwentaryzacji powinien pozostać bez zmian.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8dfab79f041949d4aae2d17797e59d6a) · request `cc-1793495509755-ykypmkh0r` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/60dc55fed6db4087b98f825ea2ada1a4) — request `cc-1793495420233-b1hpffn4e`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/bb111bd81a0f433e87a3bc0491d5bcc6) — request `None`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/d8bdc1b4201542c8894b40dee666012d) — request `cc-1793495437600-xpu4n0v9z`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9c35bd92f2a347168c8010403d9ccf31) — request `cc-1793495453481-bqfbsnlkd`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dbf0623d89894717b3932efdd907e20a) — request `cc-1793495477843-80wbnevfk`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/09c8a7fac4e74c95b359765547a2b320) — request `cc-1793495495620-hrpx5xe14`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8dfab79f041949d4aae2d17797e59d6a) — request `cc-1793495509755-ykypmkh0r`, draft `6e290240-071d-41cd-a4d8-813c209bd274`, prompt `stationary_energy_review`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `f6e38de1-72d2-5ca8-81dd-daebea7461a1`; draft: `f2d54630-8b53-4581-b080-5181939e3602`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Trigger jest realny: draft utworzony dla pustego celu przed UI zapisem75000 kg. | Draft powstał dla pustego celu; odrębna sesja współpracownika wprowadziła 75000 kg przez UI przed potwierdzeniem. | PASS |
| A2 | Po próbie ta sama InventoryValue.id nadal ma75000 kg oraz te same Activity/GasValue i datasource metadata. | Przed awarią: [('d1a35c96-ae20-4b66-9fc1-cb351f726b05', '75000')]; po niej: []. Wartość została usunięta. | FAIL |
| A3 | Po S1 nie powstało usunięcie, zastąpienie ani nowa history version. | Graf danych zmienił się po S1. Nie wykonano wersjonowanego usunięcia utraconej wartości. | FAIL |
| A4 | CC/CA/UI raportują konflikt lub błąd bez twierdzenia o udanym zapisie120000 kg; P3 podaje 75.000 t. | Źródło nie zostało poprawnie zastosowane, lecz dotychczasowe 75000 kg zniknęło. P3 nie potwierdza wymaganych 75 t; w próbach 2/3 błędnie zaprzecza istnieniu poprzedniej wartości. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Wybierz SS11-replacement dla I.1.1, ale na razie nie zapisuj do inwentaryzacji.

**Odpowiedź:**

Wybrano **SS11-replacement** dla **I.1.1 — budynki mieszkalne, Scope 1**. Wybór jest tylko etapowany w przeglądzie; nic nie zostało zapisane do inwentaryzacji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7c27818a2f324a6ab7a5601c191fb6d0) · request `cc-1793495437712-io0qmak4y` · model `openai/gpt-5.6-terra`.

**Prompt:** Zapisz zaakceptowany szkic do inwentaryzacji; pokaż kartę potwierdzenia.

**Odpowiedź:**

Karta potwierdzenia zapisu do inwentaryzacji jest gotowa. Po jej zatwierdzeniu zapisany zostanie zaakceptowany wiersz I.1.1 ze źródła **SS11-replacement**.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/39b8d9e7ff214a21a6d8d5e1e7306086) · request `cc-1793495477993-l0yftggkt` · model `openai/gpt-5.6-terra`.

**Prompt:** Operacja nie doszła do skutku. Odczytaj bieżącą emisję i powiedz, czy wcześniejsza wartość w inwentaryzacji została zachowana.

**Odpowiedź:**

Bieżący zaakceptowany szkic dla **I.1.1 — budynki mieszkalne, Scope 1** wskazuje **120 000 kg CO₂** ze źródła **SS11-replacement**.

Zapis do inwentaryzacji nie powiódł się, a wiersz inwentaryzacji nadal nie ma zapisanej wartości. Nie było wcześniejszej wartości do zachowania — pozostaje pusty.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a8b31c6f17f94b0186d3cc0ab2632506) · request `cc-1793495509744-gdzn773kp` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/cf59a2cdaae74732a6ed50e5bf7c5dd9) — request `cc-1793495420057-tof7wjh2l`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/f745205a0c1048cfada3dc04e74066db) — request `None`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/7c27818a2f324a6ab7a5601c191fb6d0) — request `cc-1793495437712-io0qmak4y`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/75888b4ca56042558e30076456fffa7d) — request `cc-1793495453199-z6lgt3n4o`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/39b8d9e7ff214a21a6d8d5e1e7306086) — request `cc-1793495477993-l0yftggkt`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a3751a37da404a38b56d4e27dc465687) — request `cc-1793495495651-wsykugz0f`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a8b31c6f17f94b0186d3cc0ab2632506) — request `cc-1793495509744-gdzn773kp`, draft `f2d54630-8b53-4581-b080-5181939e3602`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `f000b840-f30a-5f71-8bcd-6505646a9acb`; draft: `7756461f-9a55-4d33-bdbf-80d676302ebe`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| A1 | Trigger jest realny: draft utworzony dla pustego celu przed UI zapisem75000 kg. | Draft powstał dla pustego celu; odrębna sesja współpracownika wprowadziła 75000 kg przez UI przed potwierdzeniem. | PASS |
| A2 | Po próbie ta sama InventoryValue.id nadal ma75000 kg oraz te same Activity/GasValue i datasource metadata. | Przed awarią: [('5e7d16d0-2481-4178-a12f-e3d9403bc303', '75000')]; po niej: []. Wartość została usunięta. | FAIL |
| A3 | Po S1 nie powstało usunięcie, zastąpienie ani nowa history version. | Graf danych zmienił się po S1. Nie wykonano wersjonowanego usunięcia utraconej wartości. | FAIL |
| A4 | CC/CA/UI raportują konflikt lub błąd bez twierdzenia o udanym zapisie120000 kg; P3 podaje 75.000 t. | Źródło nie zostało poprawnie zastosowane, lecz dotychczasowe 75000 kg zniknęło. P3 nie potwierdza wymaganych 75 t; w próbach 2/3 błędnie zaprzecza istnieniu poprzedniej wartości. | FAIL |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Wybierz SS11-replacement dla I.1.1, ale na razie nie zapisuj do inwentaryzacji.

**Odpowiedź:**

Wybrałem źródło **SS11-replacement** dla wiersza **I.1.1 — budynki mieszkalne, Scope 1**. Wybór jest tylko etapowany w przeglądzie i **nie został zapisany do inwentaryzacji**.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/481654ee17984a4f94f2e8d88c8fd0e8) · request `cc-1793495393578-qgg3ytwyn` · model `openai/gpt-5.6-terra`.

**Prompt:** Zapisz zaakceptowany szkic do inwentaryzacji; pokaż kartę potwierdzenia.

**Odpowiedź:**

Karta potwierdzenia zapisu do inwentaryzacji jest gotowa. Po jej zatwierdzeniu zapisany zostanie zaakceptowany wiersz I.1.1.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/94e5d822b77c4e0c9533451eb6f5dfb5) · request `cc-1793495424459-r8qdk4qvv` · model `openai/gpt-5.6-terra`.

**Prompt:** Operacja nie doszła do skutku. Odczytaj bieżącą emisję i powiedz, czy wcześniejsza wartość w inwentaryzacji została zachowana.

**Odpowiedź:**

Operacja zapisu do inwentaryzacji nie powiodła się. W inwentaryzacji wiersz **I.1.1 — budynki mieszkalne, Scope 1** nadal nie ma zapisanej emisji (brak wcześniejszej wartości liczbowej do zachowania).

W szkicu pozostaje zaakceptowane źródło **SS11-replacement**, z proponowaną emisją **120 000 kg CO₂**. Nie zostało ono jednak zapisane do inwentaryzacji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/07935190b7814138a65cd3e38f3df11c) · request `cc-1793495465336-jkmakns6w` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_draft_start_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5f270be8439d4f2296d77f724fd8658d) — request `cc-1793495379116-a11my14dk`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `None`.
- [stationary_energy_draft_generation_background · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2f103724f2b647cdb542ba9bac9fcfb7) — request `None`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/481654ee17984a4f94f2e8d88c8fd0e8) — request `cc-1793495393578-qgg3ytwyn`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `stationary_energy_review`.
- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/0152730e25514f2699d166bfd685eb4e) — request `cc-1793495404201-jjrcl5575`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/94e5d822b77c4e0c9533451eb6f5dfb5) — request `cc-1793495424459-r8qdk4qvv`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `stationary_energy_review`.
- [stationary_energy_save_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/1242eb600c3444babe4a6ce1193e567e) — request `cc-1793495447471-hv8d2r0ua`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/07935190b7814138a65cd3e38f3df11c) — request `cc-1793495465336-jkmakns6w`, draft `7756461f-9a55-4d33-bdbf-80d676302ebe`, prompt `stationary_energy_review`.

