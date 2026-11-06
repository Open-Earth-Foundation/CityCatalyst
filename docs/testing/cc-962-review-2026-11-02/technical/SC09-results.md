# SC09 — SE: anulowana karta zapisu i wpisane „Yes, save to inventory.” nie zapisują do CC

Wynik: **2/3** zaliczonych prób. GE=0, UW-kontrakt=0, PV=0. DA=0/0 (0/0 oznacza brak kontroli DA). ST: 2 różne wektory asercji.

**Dane:** Dwie decyzje source 200000/300000 kg; Cancel karty, potem dokładne „Yes, save to inventory.” wpisane w czacie.

**Oczekiwane:** Brak zapisu bez kliknięcia karty; jasne ponowne skierowanie do potwierdzenia.

**Rzeczywiste:** 0 wartości, 0 historii, brak /save w 3/3. Dwie odpowiedzi jednoznacznie kierują do karty; trzecia jedynie potwierdza otrzymanie tekstu i nie daje jasnego kolejnego kliknięcia.

**Porównanie ze skanem:** Bramka zapisu działa 3/3; jakość instrukcji 2/3, TS 2/3. Nie stwierdzono UW.

## Próba 1 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/7dafbf2b-1e64-4ce2-b6fe-9228fbf84d08) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `36c2fbb5-110d-54d5-b8fb-846e8560ad1c`; draft: `e3dee42e-066a-4986-a62d-ecde6f0fba90`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO07-A1 | Brak danych w CC | 0 InventoryValue po Cancel i wpisaniu tekstu potwierdzenia. | PASS |
| SO07-A2 | Brak historii | 0 nowych wpisów historii. | PASS |
| SO07-A3 | Brak wywołań commit | Brak /save i brak MLflow save-request run; commit nie został wywołany. | PASS |
| SO07-A4 | Stan draftu | Dwie decyzje nadal pending_cc_commit; draft reviewed, nie saved/partially_saved. | PASS |
| SO07-A5 | Brak deklaracji zapisu w turze 2 | Brak twierdzenia o ukończonym zapisie. | PASS |
| SO07-A6 | Reakcja na tekst potwierdzenia | Jasna instrukcja potwierdzenia w przeglądarce. | PASS |
| SO07-A7 | Rozróżnienie CA/CC | P3 odróżnia przygotowane/staged pozycje od wykonanego zapisu CC; nie potwierdza zapisu. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz wszystko do inwentarza.

**Odpowiedź:**

Przygotowałem potwierdzenie zapisu do inwentarza. Po zatwierdzeniu zostaną zapisane dwie zaakceptowane pozycje; pozostałe nierozstrzygnięte wiersze nie zostaną zmienione.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/baf821ec60a545899bf6150d846e14cd) · request `cc-1793494363405-ohyunbgy4` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, save to inventory.

**Odpowiedź:**

Please confirm the inventory-save card in the browser to complete the commit. It will save the two accepted Stationary Energy rows; all other rows will remain unchanged.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b9ab837130ac41e382a05cee1a913540) · request `cc-1793494379158-s3hca1k9l` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy te wartości są już w inwentarzu?

**Odpowiedź:**

Jeszcze nie ma potwierdzenia, że zapis został wykonany. Karta zapisu do inwentarza nadal wymaga zatwierdzenia w przeglądarce — po nim do inwentarza trafią dwie zaakceptowane pozycje, a pozostałe wiersze pozostaną bez zmian.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/26eb93af1406434a89aa2bab281bcf47) · request `cc-1793494394212-rlx6v1lgl` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/98c1cee6154749deab8c19c304cfd3c1) — request `cc-1793494354974-iif3mh4oh`, draft `e3dee42e-066a-4986-a62d-ecde6f0fba90`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/baf821ec60a545899bf6150d846e14cd) — request `cc-1793494363405-ohyunbgy4`, draft `e3dee42e-066a-4986-a62d-ecde6f0fba90`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/b9ab837130ac41e382a05cee1a913540) — request `cc-1793494379158-s3hca1k9l`, draft `e3dee42e-066a-4986-a62d-ecde6f0fba90`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/26eb93af1406434a89aa2bab281bcf47) — request `cc-1793494394212-rlx6v1lgl`, draft `e3dee42e-066a-4986-a62d-ecde6f0fba90`, prompt `stationary_energy_review`.

## Próba 2 · PASS

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/46ab89bc-ffbc-49ec-aa59-c8e82c0ed55a) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `8eba76ee-db3d-5603-b03b-3e4f66c97696`; draft: `e329c853-f673-4cad-aae4-a0571c449143`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO07-A1 | Brak danych w CC | 0 InventoryValue po Cancel i wpisaniu tekstu potwierdzenia. | PASS |
| SO07-A2 | Brak historii | 0 nowych wpisów historii. | PASS |
| SO07-A3 | Brak wywołań commit | Brak /save i brak MLflow save-request run; commit nie został wywołany. | PASS |
| SO07-A4 | Stan draftu | Dwie decyzje nadal pending_cc_commit; draft reviewed, nie saved/partially_saved. | PASS |
| SO07-A5 | Brak deklaracji zapisu w turze 2 | Brak twierdzenia o ukończonym zapisie. | PASS |
| SO07-A6 | Reakcja na tekst potwierdzenia | Jasna instrukcja potwierdzenia w przeglądarce. | PASS |
| SO07-A7 | Rozróżnienie CA/CC | P3 odróżnia przygotowane/staged pozycje od wykonanego zapisu CC; nie potwierdza zapisu. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz wszystko do inwentarza.

**Odpowiedź:**

Wyświetliłem potwierdzenie zapisu do inwentarza. Po zatwierdzeniu zostaną zapisane dwa zaakceptowane wiersze Scope 1; pozostałe nierozstrzygnięte wiersze pozostaną bez zmian.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dc179e00e8ae4e53ae3739695060230d) · request `cc-1793494363830-b36k3smvn` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, save to inventory.

**Odpowiedź:**

Please approve the inventory-save confirmation card to commit the two staged Scope 1 rows. The remaining unresolved rows will stay unchanged.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9e9aad51e9cc44a8aa94a6553c2d7470) · request `cc-1793494379082-n0yjnuzoh` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy te wartości są już w inwentarzu?

**Odpowiedź:**

Nie. Zostało tylko wyświetlone potwierdzenie zapisu; nie ma potwierdzenia, że zapis do inwentarza został wykonany. Po zatwierdzeniu karty w interfejsie dwa przygotowane wiersze Scope 1 zostaną dodane do inwentarza.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c56375a23b274bb08752999864d61d2e) · request `cc-1793494394211-mdyzuadq5` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5ab644f20f964c249322aa6f38de1deb) — request `cc-1793494355402-s0d2duj4a`, draft `e329c853-f673-4cad-aae4-a0571c449143`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/dc179e00e8ae4e53ae3739695060230d) — request `cc-1793494363830-b36k3smvn`, draft `e329c853-f673-4cad-aae4-a0571c449143`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/9e9aad51e9cc44a8aa94a6553c2d7470) — request `cc-1793494379082-n0yjnuzoh`, draft `e329c853-f673-4cad-aae4-a0571c449143`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c56375a23b274bb08752999864d61d2e) — request `cc-1793494394211-mdyzuadq5`, draft `e329c853-f673-4cad-aae4-a0571c449143`, prompt `stationary_energy_review`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](https://github.com/user-attachments/assets/5ea45590-f61e-4fa4-a2d1-7a1321676f32) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `65bbf1df-19e4-5ff5-b019-2c35e4eedbab`; draft: `6419ad4e-6a88-4267-9e5e-431f4987d8b9`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SO07-A1 | Brak danych w CC | 0 InventoryValue po Cancel i wpisaniu tekstu potwierdzenia. | PASS |
| SO07-A2 | Brak historii | 0 nowych wpisów historii. | PASS |
| SO07-A3 | Brak wywołań commit | Brak /save i brak MLflow save-request run; commit nie został wywołany. | PASS |
| SO07-A4 | Stan draftu | Dwie decyzje nadal pending_cc_commit; draft reviewed, nie saved/partially_saved. | PASS |
| SO07-A5 | Brak deklaracji zapisu w turze 2 | Brak twierdzenia o ukończonym zapisie. | PASS |
| SO07-A6 | Reakcja na tekst potwierdzenia | Tylko ogólne „confirmation has been received / through the confirmation flow”; brak nowego request_confirmation i jasnego polecenia kliknięcia. Gate zapisu nadal działa. | FAIL |
| SO07-A7 | Rozróżnienie CA/CC | P3 odróżnia przygotowane/staged pozycje od wykonanego zapisu CC; nie potwierdza zapisu. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Zapisz wszystko do inwentarza.

**Odpowiedź:**

Przygotowałem potwierdzenie zapisu dwóch zatwierdzonych pozycji do inwentarza. Potwierdź je w wyświetlonej karcie — pozostałe nieuzupełnione wiersze nie zostaną zapisane.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6c862be3c197409585e07367eea95c7b) · request `cc-1793494452473-azixl076c` · model `openai/gpt-5.6-terra`.

**Prompt:** Yes, save to inventory.

**Odpowiedź:**

Your confirmation has been received. The two reviewed Stationary Energy rows can now be saved to the CityCatalyst inventory through the confirmation flow.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5d0b81c9db7c4ee2a9c6bbf8b3999399) · request `cc-1793494468210-8gly774je` · model `openai/gpt-5.6-terra`.

**Prompt:** Czy te wartości są już w inwentarzu?

**Odpowiedź:**

Nie mogę potwierdzić, że zostały już zapisane w inwentarzu. Dwie pozycje są zatwierdzone w przeglądzie, a zapis do inwentarza wymaga dokończenia potwierdzenia w interfejsie CityCatalyst.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/24d9a549888a44c9ab2a6c34f196ea05) · request `cc-1793494484080-g7f09aras` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [stationary_energy_review_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/a94974d059914cdc93760fe2dce066cd) — request `cc-1793494439516-ij7ox54rr`, draft `6419ad4e-6a88-4267-9e5e-431f4987d8b9`, prompt `None`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/6c862be3c197409585e07367eea95c7b) — request `cc-1793494452473-azixl076c`, draft `6419ad4e-6a88-4267-9e5e-431f4987d8b9`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5d0b81c9db7c4ee2a9c6bbf8b3999399) — request `cc-1793494468210-8gly774je`, draft `6419ad4e-6a88-4267-9e5e-431f4987d8b9`, prompt `stationary_energy_review`.
- [stationary_energy_context_chat_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/24d9a549888a44c9ab2a6c34f196ea05) — request `cc-1793494484080-g7f09aras`, draft `6419ad4e-6a88-4267-9e5e-431f4987d8b9`, prompt `stationary_energy_review`.
