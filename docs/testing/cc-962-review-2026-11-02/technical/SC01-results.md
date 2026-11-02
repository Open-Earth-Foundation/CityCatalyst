# SC01 — PDF w rękach użytkownika: uczciwe przejście do importu UI

Wynik: **0/3** zaliczonych prób. GE=5, UW-kontrakt=0, PV=0. DA=0/0 (0/0 oznacza brak kontroli DA). ST: 1 różne wektory asercji.

**Dane:** Opis PDF za 2023; pliku nigdy nie przesłano. Fixture ma inwentarz 2024.

**Oczekiwane:** Prawdziwa, osiągalna ścieżka UI albo uczciwa informacja o jej braku; bez importu/zapisu.

**Rzeczywiste:** Model poprawnie zaprzecza otrzymaniu PDF 3/3, lecz wskazuje niedostępny upload raportu w Źródłach danych/sektorze. UPLOAD_OWN_DATA_ENABLED wyłączone; 0 inputów plikowych. P2 powtarza tę trasę w 2/3.

**Porównanie ze skanem:** F11 — nowy wariant routingu; pierwotne „załącz w czacie” nie odtworzyło się.

## Próba 1 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `2484f3b8-191e-5e49-9714-757ff5f05dfc`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

Znaczniki na głównym filmie:

- 00:28 — Import route requires manual comparison with the model instructions; no upload was attempted

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA02-A1 | P1 wskazuje osiągalną trasę importu PDF przez UI, bez polecenia „załącz tutaj”. | Model wskazuje dodanie PDF w sektorze/źródłach. UPLOAD_OWN_DATA_ENABLED jest wyłączone; inspekcja wskazanej strony nie ma input[type=file]. Nie podano osiągalnej ścieżki Import inventory. | FAIL |
| SA02-A2 | P2 jednoznacznie nie potwierdza odbioru, ekstrakcji ani zapisu pliku. | P2 odmawia potwierdzenia otrzymania PDF; żaden plik nie został wysłany. | PASS |
| SA02-A3 | Nie powstaje import job, inventory 2023 ani wartość emisji. | Brak zmian wartości/history oraz 0 ImportedInventoryFile, BulkInventoryImportJob i BulkInventoryImportItem dla fixture. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Mam raport PDF z emisjami za 2023 rok. Gdzie mam go wysłać, żeby trafił do inwentaryzacji tego miasta?

**Odpowiedź:**

Jeśli raport PDF zawiera dane emisyjne za 2023 r., dodaj go w CityCatalyst jako **źródło danych/dokument dla inwentaryzacji** danego miasta i roku 2023.

1. Otwórz inwentaryzację miasta za **2023**.
2. Przejdź do sekcji **Źródła danych** lub odpowiedniego sektora emisji.
3. Dodaj/załącz raport PDF jako dokument źródłowy.
4. Opisz, jakich sektorów, zakresów emisji i okresu dotyczą dane, a następnie wprowadź lub zweryfikuj wartości w odpowiednich polach inwentaryzacji.

Sam PDF zwykle służy jako dokumentacja źródłowa — emisje muszą jeszcze zostać przypisane do właściwych kategorii inwentaryzacji. Jeśli nie masz jeszcze inwentaryzacji na 2023 r., utwórz ją najpierw dla tego miasta.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2afb9d02f31040098916bb4bfe5d6b74) · request `cc-1793493455269-jc9lo0wjd` · model `openai/gpt-5.6-terra`.

**Prompt:** Nie widzę przycisku załącznika w czacie. Czy dostałeś już mój PDF?

**Odpowiedź:**

Nie — w tej rozmowie nie otrzymałem żadnego pliku PDF ani jego treści.

Jeśli czat nie pokazuje przycisku załącznika, raportu nie da się przesłać tutaj bezpośrednio. Dodaj go w CityCatalyst w inwentaryzacji miasta za 2023 r., w sekcji **Źródła danych** lub przy odpowiednim sektorze emisji. Jeśli opiszesz mi strukturę raportu albo wkleisz kluczowe tabele i wartości, pomogę przypisać je do kategorii inwentaryzacji.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c2dbaaefb94a46f8b5feaf782e8ddfab) · request `cc-1793493466055-aglppfidh` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/2afb9d02f31040098916bb4bfe5d6b74) — request `cc-1793493455269-jc9lo0wjd`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/c2dbaaefb94a46f8b5feaf782e8ddfab) — request `cc-1793493466055-aglppfidh`, draft `None`, prompt `chat`.

## Próba 2 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `a69b4625-214f-572e-972f-43d333b9e77f`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

Znaczniki na głównym filmie:

- 00:32 — Import route requires manual comparison with the model instructions; no upload was attempted

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA02-A1 | P1 wskazuje osiągalną trasę importu PDF przez UI, bez polecenia „załącz tutaj”. | Model wskazuje dodanie PDF w sektorze/źródłach. UPLOAD_OWN_DATA_ENABLED jest wyłączone; inspekcja wskazanej strony nie ma input[type=file]. Nie podano osiągalnej ścieżki Import inventory. | FAIL |
| SA02-A2 | P2 jednoznacznie nie potwierdza odbioru, ekstrakcji ani zapisu pliku. | P2 odmawia potwierdzenia otrzymania PDF; żaden plik nie został wysłany. | PASS |
| SA02-A3 | Nie powstaje import job, inventory 2023 ani wartość emisji. | Brak zmian wartości/history oraz 0 ImportedInventoryFile, BulkInventoryImportJob i BulkInventoryImportItem dla fixture. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Mam raport PDF z emisjami za 2023 rok. Gdzie mam go wysłać, żeby trafił do inwentaryzacji tego miasta?

**Odpowiedź:**

Wyślij lub wgraj raport w sekcji **Źródła danych / Data sources** dla właściwej inwentaryzacji miasta i roku 2023. Następnie przypisz dane z raportu do odpowiednich sektorów emisji (np. energia stacjonarna, transport, odpady).

Jeśli podasz mi miasto, mogę pomóc wskazać właściwą inwentaryzację 2023.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8366fc5c7b084fb2842143c01f0c5d08) · request `cc-1793493569964-w95m1cuia` · model `openai/gpt-5.6-terra`.

**Prompt:** Nie widzę przycisku załącznika w czacie. Czy dostałeś już mój PDF?

**Odpowiedź:**

Nie — w tej rozmowie nie otrzymałem żadnego pliku PDF ani jego treści.

Jeśli czat nie pokazuje opcji załącznika, dodaj raport bezpośrednio w CityCatalyst w odpowiedniej inwentaryzacji miasta za 2023 r., w sekcji **Źródła danych**. Jeśli podasz miasto, pomogę Ci odnaleźć właściwą inwentaryzację.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8b04c16ca470456daa2bb2b79c24146a) · request `cc-1793493581823-k62n8bn3o` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8366fc5c7b084fb2842143c01f0c5d08) — request `cc-1793493569964-w95m1cuia`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/8b04c16ca470456daa2bb2b79c24146a) — request `cc-1793493581823-k62n8bn3o`, draft `None`, prompt `chat`.

## Próba 3 · FAIL

Zakres: dev browser + real APIs/DB. [Nagranie MP4](MEDIA_PENDING) · Execution JSON (local execution artifact; not distributed) · Kadr z filmu (local execution artifact; not distributed).

Inventory: `8a62eb4b-ea0a-5a20-af22-f4001b828db3`; draft: `brak`. Fixture zostały po zabezpieczeniu odczytów usunięte; stan z próby jest w archiwach.

[Nagranie uzupełniające: UI/Results lub stan po retry](MEDIA_PENDING) · readback (local execution artifact; not distributed).

Znaczniki na głównym filmie:

- 00:32 — Import route requires manual comparison with the model instructions; no upload was attempted

| Asercja | Oczekiwane | Rzeczywiste | Wynik |
|---|---|---|---|
| SA02-A1 | P1 wskazuje osiągalną trasę importu PDF przez UI, bez polecenia „załącz tutaj”. | Model wskazuje dodanie PDF w sektorze/źródłach. UPLOAD_OWN_DATA_ENABLED jest wyłączone; inspekcja wskazanej strony nie ma input[type=file]. Nie podano osiągalnej ścieżki Import inventory. | FAIL |
| SA02-A2 | P2 jednoznacznie nie potwierdza odbioru, ekstrakcji ani zapisu pliku. | P2 odmawia potwierdzenia otrzymania PDF; żaden plik nie został wysłany. | PASS |
| SA02-A3 | Nie powstaje import job, inventory 2023 ani wartość emisji. | Brak zmian wartości/history oraz 0 ImportedInventoryFile, BulkInventoryImportJob i BulkInventoryImportItem dla fixture. | PASS |

Prompty i odpowiedzi z rzeczywistych artefaktów MLflow:

**Prompt:** Mam raport PDF z emisjami za 2023 rok. Gdzie mam go wysłać, żeby trafił do inwentaryzacji tego miasta?

**Odpowiedź:**

Jeśli raport PDF zawiera dane źródłowe do inwentaryzacji 2023, dodaj go w sekcji **Źródła danych / Data sources** w odpowiedniej inwentaryzacji miasta i przypisz do właściwego sektora (np. energia, transport, odpady).

Upewnij się najpierw, że masz otwartą właściwą inwentaryzację dla **miasta i roku 2023**. Jeśli w Twojej wersji CityCatalyst nie ma opcji dodania pliku, dane z raportu trzeba wprowadzić do odpowiednich pól/sektorów ręcznie, zachowując PDF jako dokumentację źródłową.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/be66f4a747c84ef18629bc744595e7a5) · request `cc-1793493569943-lblovpi6p` · model `openai/gpt-5.6-terra`.

**Prompt:** Nie widzę przycisku załącznika w czacie. Czy dostałeś już mój PDF?

**Odpowiedź:**

Nie — nie otrzymałem żadnego PDF-a w tej rozmowie. Jeśli nie widzisz przycisku załącznika, ten czat prawdopodobnie nie obsługuje przesyłania plików.

Możesz:
- wkleić najważniejsze tabele lub wartości z raportu tutaj,
- podać link do raportu, jeśli jest publicznie dostępny,
- albo dodać dane bezpośrednio w odpowiednich sektorach inwentaryzacji w CityCatalyst.

[MLflow run](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ea49f364510d4578ac09070d23377316) · request `cc-1793493582160-2ugph749s` · model `openai/gpt-5.6-terra`.

Powiązane runy (FINISHED oznacza zakończenie runu, a nie poprawność produktu):

- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/be66f4a747c84ef18629bc744595e7a5) — request `cc-1793493569943-lblovpi6p`, draft `None`, prompt `chat`.
- [climate_advisor_message_request · FINISHED](https://mlflow-dev.openearth.dev/#/experiments/4/runs/ea49f364510d4578ac09070d23377316) — request `cc-1793493582160-2ugph749s`, draft `None`, prompt `chat`.

