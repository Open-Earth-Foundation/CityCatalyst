# Mapa zmian agentic flow według JVP

Analiza produktu, interfejsu i backendu · 15 listopada 2026

## 1. Główna zmiana

JVP proponuje, żeby podstawą pracy była trwała lista potrzebnych informacji i decyzji. Dokument powstaje z tej listy. Każdy punkt ma własną wartość, pochodzenie, status i historię; może zasilać kilka fragmentów dokumentu. Clima najpierw wykorzystuje dostępne materiały, a następnie pomaga człowiekowi zdobyć pozostałe dowody i podjąć brakujące decyzje.

Przykład: kwota wnioskowanego finansowania jest potwierdzana w jednym miejscu. Podsumowanie, opis projektu i rozdział finansowy odwołują się do tego samego punktu. Zmiana kwoty oznacza przeliczenie reguł oraz aktualizację zależnych fragmentów, z zachowaniem ochrony tekstu zatwierdzonego lub zmienionego ręcznie.

To ma znaczenie również dla CRVA: brak mapy czy raportu, nieznana wartość i niewybrany wariant działania są różnymi rodzajami pracy. Wspólne mogą być mechanizmy źródeł, pytań, decyzji i review; metodologia i wymagania pozostają właściwe dla danego dokumentu.

## 2. Źródła i granice ustaleń

- **[JVP]**: [Agentic Flow Core PRD](https://claude.ai/artifact/SvHp2f4wMCY7866yViL8Hn), draft 0.3, 13 listopada 2026. Dokument określa pożądany produkt i decyzje do omówienia z Piotrem. Nie jest zatwierdzonym planem implementacji.
- **[Prototyp]**: [Agentic Flow Core Prototype](https://claude.ai/artifact/SoEaGutNbq6sMSUMsHtWkP). Przejrzano tworzenie dokumentu, Context, Overview, To do, potwierdzenie wartości, konflikt źródeł, Park it, pomoc w znalezieniu dokumentu, deep decision, Draft, eksport i przykład CAP. Zrzuty wykonano 15 listopada 2026.
- **[Kod]**: checkout CityCatalyst na `e16b8f04734fbbc68aeed3d44e429dac8113e8ab`, branch `analysis/jvp-agentic-flow-direction`. Opis obecnego działania pochodzi z kodu; nie wykonano w tej analizie testu obecnego CNB na działającym środowisku.
- **[Propozycja]** oznacza moje mapowanie techniczne. Nazwy encji, statusy, endpointy i kolejność migracji poniżej wymagają uzgodnienia.

Prototyp jest demonstracją interakcji. Autor wprost podaje, że uploady, odczyty, sortowanie, odpowiedzi Clima i voice note są skryptowane, wskazówki napisane ręcznie, a część liczb wymyślona. Przykładu Krakowa nie należy traktować jako zweryfikowanych danych projektu ani wyniku benchmarku. Przykład CAP pokazuje intencję współdzielenia produktu, ale nie dowodzi uniwersalności backendu.

## 3. Jak zmienia się cały proces

**Obecny model w kodzie:** utworzenie runu → źródła i context bundle → wybór szablonu → generowanie rozdziałów i zapis gapów → odpowiedzi lub edycje z review → walidacja i eksport. Przy nowym źródle system wybiera rozdziały, na które ono wpływa, i wykonuje ich ponowne generowanie. Gapy są już trwałymi rekordami, a nie wyłącznie tekstem czatu.

**Model JVP:** wybór typu dokumentu → materializacja wymaganych punktów → dokumenty i dane miasta → kandydaci odpowiedzi z dowodami → potwierdzenie lub decyzja → wspólna lista punktów → Overview, To do, czat i draft jako widoki tego samego stanu. Dopływ pliku albo odpowiedzi ponawia tę pętlę. Dokument roboczy istnieje przed zakończeniem wszystkich zadań.

Istotna granica: jeden punkt jest współdzielony przez fragmenty danego dokumentu. PRD nie ustala jeszcze automatycznego współdzielenia zaakceptowanych wartości pomiędzy wszystkimi dokumentami miasta. Rok danych, zakres projektu, jednostki i uprawnienia nadal muszą być zachowane.

## 4. Zmiany wizualne, ekran po ekranie

### UI-01. Tworzenie dokumentu

**Dzisiaj [Kod]:** dialog tworzy nazwany run i przyjmuje początkowe pliki. Wybór finansowania oraz szablonu jest obsługiwany również wewnątrz workspace'u.

**JVP:** tytuł, funder/programme albo typ dokumentu, jeden obszar uploadu i lista materiałów pomocnych dla tego konkretnego celu. Komunikat pozwala zacząć z tym, co użytkownik ma. Wybór typu dokumentu następuje wcześnie, ponieważ ustala wymagania całej dalszej pracy.

**Backend:** konfiguracja dokumentu musi być znana przed analizą braków. Wybór konfiguracji uruchamia utworzenie punktów i potrzeb dowodowych. Zmiana fundera lub szablonu wymaga jawnego przeliczenia wymagań i zależności, z zachowaniem dotychczasowych odpowiedzi i ich historii tam, gdzie nadal pasują.

**Punkt zaczepienia:** `app/src/components/ConceptNoteDashboard/new-concept-note-dialog.tsx:73`, `services/cnb/application_context.py`, model `CnbFunderTemplate`.

### UI-02. Context jako dokumenty pogrupowane według potrzeb

**Dzisiaj [Kod]:** Context pokazuje dane miasta, stan źródeł i uploadów, finansowanie i szablon. Istnieją obsługa OCR, retry, odczyt Markdown i budowa bundle'a.

**JVP:** sekcje takie jak raport statusowy, feasibility study, financing plan czy potwierdzenie grants/state aid. Pełna sekcja pokazuje plik i punkty, które on wspiera. Pusta wyjaśnia, dlaczego materiał jest potrzebny. Użytkownik może dodać plik później, wskazać inną osobę albo powiedzieć, że dokument nie istnieje.

**Backend:** relacja wiele-do-wielu plik–potrzeba–punkt. Grupa dokumentów jest pomocą organizacyjną; sam punkt pyta o fakt lub decyzję i może zostać rozwiązany innym materiałem. Nie należy wymagać konkretnej nazwy pliku jako jedynej dopuszczalnej odpowiedzi.

**Punkt zaczepienia:** `ConceptNoteWorkspace/context-tab.tsx:322`, `services/cnb/context_bundle.py`, `services/cnb/source_analysis.py` i istniejący pipeline upload/OCR.

### UI-03. Help me find it

**JVP i prototyp:** objaśnienie, kto zwykle ma potrzebny materiał, jak o niego poprosić i jakie dokumenty alternatywne mogą wystarczyć. Przycisk przygotowuje treść prośby. Przykład finansowania wskazuje finance director albo City Treasurer.

**Backend:** wskazówka wynika z konfiguracji potrzeby i znanego kontekstu projektu. Wygenerowana prośba jest tekstem do wykorzystania przez użytkownika. PRD nie daje podstawy, żeby traktować ten przycisk jako automatyczne wysłanie maila, kontakt z urzędem czy web research. Funder search jest poza core.

### UI-04. Overview jako miejsce powrotu

**Dzisiaj [Kod]:** workspace ma zakładki Draft, Structure i Context; początkowo wybiera Draft. Istnieją komunikaty kolejnego kroku i podsumowanie draftu w czacie.

**JVP:** osobna zakładka Overview. Pokazuje pokrycie wymagań obowiązkowych i opcjonalnych oddzielnie, najważniejsze fakty wraz ze źródłami, trzy rekomendowane następne kroki, oczekiwanie na innych i miniaturę dokumentu z fragmentami gotowymi oraz otwartymi.

**Backend:** widok wyliczany z punktów, zadań i aktualności draftu. Liczniki i status eksportu powinny wynikać z tej samej polityki. Rekomendacja kolejności działań może korzystać z modelu, ale obowiązkowość, liczba nierozwiązanych punktów i zależności wymagają deterministycznego odczytu.

**Punkt zaczepienia:** `ConceptNoteWorkspace/index.tsx:65`, `index.tsx:96`, `services/cnb/ui_context.py:17`.

### UI-05. Trwałe To do

**Dzisiaj [Kod]:** braki są przypisane do runu i zwykle rozdziału; użytkownik otwiera je z kontekstu tekstu/review. Istnieją strukturalne pytania, odpowiedzi i statusy gapów.

**JVP:** osobny widok całej pracy, grupujący potwierdzenia, konflikty źródeł, dokumenty do zdobycia, decyzje/odpowiedzi, oczekiwanie na innych i punkty pokryte. Po lewej lista, po prawej szczegół wybranego punktu. Punkt pozostaje rozpoznawalny przez kolejne sesje i zmiany tekstu.

**Backend:** lista musi istnieć przed generowaniem prozy. To do jest widokiem wspólnych rekordów, a nie kolejną kopią gapów przechowywaną w stanie Reacta. Rodzaj pracy nie jest tym samym co prawdziwość odpowiedzi czy jej obowiązkowość.

### UI-06. Confirm what I found

**JVP:** wartość, dokładny cytat, dokument i strona, opcjonalna notatka, Confirm oraz Correct it. Znalezienie wartości i jej zatwierdzenie są osobnymi zdarzeniami.

**Backend:** ekstrakcja zapisuje kandydata z dowodem. Akcja użytkownika wybiera przyjętą wartość, zachowując pochodzenie dokumentowe oraz autorstwo potwierdzenia. Sama etykieta „user confirmed” nie powinna zastępować źródła. Potwierdzenie przechodzi przez sprawdzenie wersji punktu i idempotencji.

**Do doprecyzowania:** PRD opisuje potwierdzanie odczytanych wartości przed ich wejściem do dokumentu, a prototyp startuje również z punktami już oznaczonymi jako pokryte. Trzeba ustalić, kiedy źródło lub dane CC wystarczają automatycznie, a kiedy potrzebna jest akceptacja człowieka. Nie wynika z tego gotowa reguła dla wszystkich punktów.

### UI-07. Bring evidence, formularz i Quick pick

**JVP:** upload związany z wybranym punktem; po odczycie system pokazuje znalezione odpowiedzi oraz inne punkty wspierane przez ten sam plik. Krótkie odpowiedzi dostają odpowiedni formularz albo wybór, z wyjaśnieniem konsekwencji. Zawsze można odpowiedzieć własnymi słowami.

**Backend:** plik jest analizowany dla całego dokumentu, mimo że użytkownik dodał go z jednego punktu. Formularz zapisuje wartość o zdefiniowanym kształcie. Sugestie i prefill nie są automatyczną akceptacją. Weryfikacja jednostek, zakresów i spójności należy do kodu.

**Punkt zaczepienia:** `gap-answer-form.tsx:75`, `models/cnb/gap_question.py`, `routes/concept_note_runs.py:119`.

### UI-08. Konflikt źródeł i Compare options

**Prototyp:** rozbieżne terminy rozpoczęcia kursowania są pokazane obok siebie z osobnymi źródłami i objaśnieniem. Użytkownik wskazuje właściwy albo podaje inną odpowiedź.

**JVP:** dla decyzji system pokazuje alternatywy, ich skutki oraz uzasadnienie dopasowania do dokumentów. Nic nie jest preselected. W prostym porównaniu mieści się pierwsza wersja; wieloetapowy Deep decision jest opisany jako późniejszy etap.

**Backend:** zachowujemy wielu kandydatów i odrębne zdarzenie wyboru. Nie stosujemy zasady „ostatni plik wygrywa”. Rekomendacja to nie zaakceptowana decyzja. Opcje wymagają źródła albo jawnego oznaczenia, co jest proponowanym wariantem i jakie założenia za nim stoją.

### UI-09. Park it i oczekiwanie na innych

**JVP:** użytkownik zapisuje, na kogo lub na co czeka i czego potrzebuje. Punkt nadal jest otwarty, ale wiadomo, jaki ruch ma go odblokować. Współpracownik docelowo widzi przypisane zadanie u siebie.

**Backend:** trwała informacja o oczekiwaniu, odpowiedzialnej osobie i potrzebnym materiale/odpowiedzi. Samo „waiting” nie zamyka wymagania. Warto odróżnić swobodną nazwę zewnętrznego kontaktu od identyfikatora współpracownika posiadającego konto i uprawnienia.

### UI-10. Czat jako drugie wejście do punktu

**Dzisiaj [Kod]:** istnieją pytania z choices, formularz gapu i propozycje edycji. Odpowiedź na gap jest składana jako instrukcja edycji wskazanego rozdziału.

**JVP:** karta bieżącego punktu jest częścią czatu; proste potwierdzenie działa tam, bogatszy ekran otwiera się po prawej. Uploady z czatu trafiają do tego samego procesu źródeł. Odpowiedź tekstowa i odpowiedź formularzem zapisują tę samą operację punktu. Voice notes są później.

**Backend:** narzędzie czatu przekazuje typowaną komendę do wspólnej usługi punktów. Zapis przyjętej odpowiedzi następuje niezależnie od czasu potrzebnego na zmianę prozy. UI pokazuje osobno „odpowiedź zapisana” i „draft aktualizuje się”.

**Punkt zaczepienia:** `chat-panel.tsx:389`, `concept_note_question.py`, `services/agent_service.py:449`.

### UI-11. Draft i Structure

**JVP:** Structure zachowuje edytowalność. Draft zachowuje rozdziały i Review & confirm, ale brakujący fragment prowadzi bezpośrednio do punktu, który go uzupełni. Pochodzenie tekstu jest widoczne; zmiany punktów odświeżają zależne fragmenty w tle.

**Backend:** potrzebne jest trwałe powiązanie fragment–punkt oraz wersje użytych wartości. Ręczny tekst i Ready wymagają propozycji do zaakceptowania. Zmiana struktury, fundera lub szablonu może wymagać pełnego przebiegu. Zwykłe dopisanie odpowiedzi nie powinno generować całego dokumentu.

### UI-12. Review and export

**Dzisiaj [Kod]:** eksport ostrzega o brakach i wymaga ich potwierdzenia; otwarty krytyczny gap nie wyłącza eksportu po acknowledgement.

**JVP:** osobne Export working draft i Export final document. Roboczy dokument można przekazać wcześniej; finalny odblokowuje się po pokryciu wymagań lub zapisaniu dozwolonych, jawnych założeń.

**Do uzgodnienia:** które wymagania dopuszczają assumption albo doesn't apply, kto zatwierdza wyjątek oraz jak finalny eksport zachowuje się przy nieaktualnym tekście lub oczekującej zmianie chronionego fragmentu. Samo odłożenie punktu nie stanowi pokrycia.

**Punkt zaczepienia:** `concept-note-export.ts:101`, `export-dialog.tsx`.

### UI-13. Dokument miasta i drugi typ dokumentu

**JVP:** dokument należy do miasta, z autorstwem każdej odpowiedzi. Czat może pozostać prywatny. Ekrany CAP korzystają z tego samego układu i wzorców, z inną konfiguracją potrzeb i struktury.

**Backend:** współdzielenie wymaga spójnej autoryzacji runu, punktów, plików, edycji i historii. Reguły ról miasta/modułu są ponownie sprawdzane po odebraniu dostępu. Drugi typ dokumentu ma dowieść braku zaszytych założeń fundera; CRVA wymaga dodatkowo własnej metodologii i walidacji dziedzinowej.

## 5. Co istnieje i co wymaga rozszerzenia

1. **Trwałe gapy już istnieją.** `ConceptNoteGap` ma UUID, `field_key`, źródła, status i wersję, a `ConceptNoteGapResolution` zapisuje zdarzenia odpowiedzi z autorem i idempotency key. Sformułowanie PRD o rozpoczęciu od „stable IDs” wymaga doprecyzowania: potrzebna jest stabilna tożsamość semantycznego punktu ponad rozdziałami i redraftem, nie samo dodanie kolumny UUID.
2. **Pytania strukturalne już istnieją.** Nowością jest ich powiązanie z pełnym cyklem punktu, potwierdzeniem materiału, pracą odłożoną i wspólnym To do.
3. **Odczyt źródeł już istnieje.** Warto zachować weryfikację artefaktów i dokładnych cytatów, OCR i retry oraz kontrolę dostępu. Nie trzeba budować drugiego pipeline'u plików.
4. **Selektywne aktualizowanie rozdziałów już istnieje.** JVP oczekuje dokładniejszej granularity: pojedynczych zależnych fragmentów.
5. **Evidence links mają model i użycia.** Są czytane przez walidację i kopiowane przy duplikowaniu. Nie znalazłem w przejrzanym przepływie ich wykorzystania jako grafu zależności punkt–wersja–fragment. Zdanie PRD „not used yet” upraszcza ten stan; samo istnienie tabeli nie realizuje mechanizmu przepisywania fragmentów.
6. **Rewizje, idempotencja i review stanowią fundament.** Zachowujemy ich kontrakty przy wydzielaniu wspólnych możliwości Clima.
7. **Właścicielem runu nadal jest użytkownik.** Zmiana na współdzielenie miasta obejmuje więcej niż widoczność na dashboardzie.

## 6. Proponowany model danych

Poniższe nazwy są robocze. PRD definiuje zachowanie, a nie finalne tabele czy nazwy endpointów.

### Konfiguracja typu dokumentu

`DocumentSetupVersion` zawiera wersję szablonu, definicje punktów, obowiązkowość, kształt wartości, typowe potrzeby dowodowe, headline facts i reguły między punktami. Wersję podpisuje ekspert. Rozróżniamy definicję punktu od jego wartości w konkretnym runie. Aktualizacja biblioteki szablonów nie powinna po cichu zmieniać rozpoczętego dokumentu.

### Punkt w dokumencie

`DocumentPoint` wiąże się z runem i kluczem semantycznym, np. `financing.additional_tranche`. Zawiera rodzaj fact/decision, aktualnie przyjętą wartość i wersję, obowiązkowość oraz typ odpowiedzi. Związek z rozdziałami jest wiele-do-wielu. Jeden rozdział używa wielu punktów; jeden punkt występuje w kilku rozdziałach. Sam zaakceptowany punkt nadal istnieje po zniknięciu luki w tekście.

Nie warto łączyć wszystkich informacji w jeden status. Proponuję oddzielić:

- **Stan odpowiedzi:** brak, kandydat do sprawdzenia, konflikt, przyjęta odpowiedź, założenie, zatwierdzone nie dotyczy.
- **Stan pracy:** aktywne, odłożone, oczekiwanie na osobę.
- **Aktualność tekstu:** aktualny, wymaga aktualizacji, generuje się, czeka na review.
- **Obowiązkowość:** wymóg obowiązkowy lub opcjonalny według setupu; krytyczność znalezionego problemu jest osobną właściwością.

### Kandydat, dowód i decyzja

`PointCandidate` przechowuje proponowaną wartość, źródło i locator strony/bloku, cytat, zakres danych i wersję artefaktu. `PointRevision` zapisuje przyjęcie, korektę, założenie lub unieważnienie, autora, czas i powód. Wiele źródeł może wspierać jedną wartość; wiele sprzecznych kandydatów może czekać na wybór. Odpowiedź użytkownika może być prawidłową decyzją bez źródła dokumentowego, z jawnym provenance `user_decision`.

### Zadanie zdobycia odpowiedzi

`PointTask` zawiera oczekiwaną informację, osobę lub kontakt, stan i notatkę. `DocumentNeed` opisuje typowy materiał pomocny dla setupu; `DocumentClassification` wiąże upload z jedną lub wieloma potrzebami. Plik nie staje się własnością punktu, z którego został dodany.

### Tekst i jego zależności

`DraftPassage` potrzebuje stabilnej tożsamości w rozdziale, wersji treści i informacji o ochronie ręcznej/Ready. `PassagePointDependency` wskazuje punkt oraz wersję przyjętej wartości wykorzystaną podczas generowania. Tożsamość fragmentu może wymagać lekkiego modelu bloków; dokładna strategia identyfikacji jest decyzją implementacyjną, zwłaszcza przy ręcznej edycji Markdown.

`PendingDraftUpdate` przechowuje propozycję dla chronionego tekstu. Zdarzenie zmiany punktu oraz trwałe zlecenie aktualizacji powinny być zapisane atomowo albo objęte równoważną gwarancją odtwarzania po awarii. Nie ma potrzeby od razu wdrażać pełnego event sourcingu; append-only historia odpowiedzi i niezawodna kolejka/outbox wystarczą do pierwszego zakresu.

## 7. Granice usług i odpowiedzialności

**CityCatalyst Core:** tożsamość użytkownika, role miasta/projektu/organizacji i dostęp modułu, źródłowe pliki i OCR, katalog dostępnych wejść, autoryzowane odczyty artefaktów, frontend i browser-facing API. Obecny NativeInputCatalog jest punktem odkrywania materiałów, ale należy potwierdzić obsługę konkretnych typów dokumentów; nie zakładamy, że każdy plik jest już dostępny dla każdego workflow.

**Climate Advisor — proponowane miejsce wspólnego core:** orkiestracja analizy, punkty i ich operacje, generowanie wskazówek, projekcje Overview/To do, zależności tekstu oraz integracja istniejącego drafting/review. To sugestia PRD pozostawiona do decyzji Piotra. Dokładne rozmieszczenie tabel pomiędzy obecną bazą workflow i schematem CNB wymaga ADR; nowa nazwa silnika sama nie uzasadnia kolejnego serwisu czy drugiego magazynu plików.

**Adapter dokumentu:** konfiguracja CNB, CAP lub CRVA z wymaganiami i regułami. Mechanizmy pytań, źródeł, gap collection i edit review mają być wspólnymi możliwościami Clima. Reguły dziedzinowe, autoryzacja zasobów, dopuszczalne założenia i uprawnienia do publikacji pozostają jawnie przekazanymi zależnościami.

**Frontend:** wyświetla stan backendu i wysyła komendy. Czat, To do i formularz nie mają własnych niezależnych wersji zaakceptowanej odpowiedzi. Lokalnie mogą istnieć wyłącznie niewysłany draft formularza, wybór zakładki czy inne ustawienia prezentacji.

## 8. Przepływy backendu

### A. Przychodzi nowy dokument

1. CC autoryzuje upload, zapisuje oryginał i wykonuje OCR/Markdown zgodnie z obecnym kontraktem.
2. CA odczytuje zweryfikowany artefakt, klasyfikuje materiał i mapuje dowody do definicji punktów.
3. Model proponuje kandydatów. Kod sprawdza typ, jednostki, dopuszczalne klucze punktów i locator cytatu.
4. Kandydaci wspierający tę samą wartość są łączeni; rozbieżni pozostają jako konflikt. Przyjęta wcześniej odpowiedź zachowuje historię; jej unieważnianie wymaga określonej polityki.
5. Overview i To do pokazują, co znaleziono, co wymaga potwierdzenia i jakie inne punkty plik wspiera.
6. Zatwierdzone wartości uruchamiają aktualizację zależnego tekstu. Sam upload nie jest automatycznym potwierdzeniem wszystkich ekstrakcji.

### B. Użytkownik potwierdza albo odpowiada

1. UI lub narzędzie czatu wysyła tę samą komendę punktu z oczekiwaną wersją i idempotency key.
2. Backend ponownie sprawdza rolę, dostęp do dokumentu i źródła oraz aktualność wskazanego kandydata.
3. Transakcja dopisuje rewizję odpowiedzi, zmienia przyjętą wartość, sprawdza reguły między punktami i zapisuje zlecenie aktualizacji tekstu.
4. UI dostaje zapisany punkt i nowy stan pracy. Nie musi czekać na generowanie prozy.
5. Worker ustala zależne fragmenty. Aktualizuje niechronione fragmenty, a dla ręcznych/Ready tworzy propozycję.
6. Przed zapisem worker ponownie sprawdza wersje punktów i tekstu. Spóźniony wynik nie może nadpisać nowszej odpowiedzi.
7. SSE albo polling odświeża wszystkie widoki. Finalny eksport bierze spójny snapshot zaakceptowanych punktów i tekstu.

### C. Źródła są sprzeczne

Zachowujemy obie wartości z locatorami i datami. Użytkownik wybiera jedną, podaje korektę albo odkłada sprawę. Wybór jest osobnym zdarzeniem z autorem. Kolejny upload nie przepisuje go automatycznie według kolejności dostarczenia plików.

### D. Odkładamy pracę

Komenda zapisuje zadanie i powód oczekiwania. Punkt nadal liczy się jako niepokryty, jeśli wymóg nie ma odpowiedzi. Przygotowanie treści prośby jest niezależne od jej wysłania. Osoba przypisana do zadania widzi je dopiero zgodnie z docelowym modelem dostępu.

### E. Dwie osoby pracują równocześnie

Obie otwierają tę samą wersję punktu. Pierwszy zapis podnosi wersję; drugi dostaje konflikt z aktualnym stanem i może ponowić świadomą decyzję. Dzisiejsze kontrole rewizji rozdziałów są podstawą wzorca, ale trzeba dodać analogiczną kontrolę punktów i źródeł. Nie należy stosować cichego last-write-wins dla decyzji.

## 9. API i zdarzenia — szkic odpowiedzialności

Można zacząć od istniejącego `/concept-notes/{run_id}` i dodać operacje punktów bez natychmiastowej zmiany wszystkich URL-i. Wspólny serwis wewnętrzny jest ważniejszy niż nazwa ścieżki. Przykładowy, niezatwierdzony kontrakt:

```text
GET  /concept-notes/{run_id}/points
GET  /concept-notes/{run_id}/overview
POST /concept-notes/{run_id}/points/{point_id}/answer
POST /concept-notes/{run_id}/points/{point_id}/confirm
POST /concept-notes/{run_id}/points/{point_id}/park
POST /concept-notes/{run_id}/points/{point_id}/choose-candidate
GET  /concept-notes/{run_id}/export-readiness
```

Komenda zawiera `expected_point_version`, a przy wyborze również tożsamość/wersję kandydata; idempotency key identyfikuje powtórzenie tej samej akcji. Wsparcie częściowego zapisu formularza jest osobną decyzją. Odpowiedź może wskazywać „point saved, draft pending”, zamiast sugerować, że cały tekst jest już aktualny.

Przykładowe zdarzenia: `point_candidate_found`, `point_answer_accepted`, `point_conflict_detected`, `point_parked`, `draft_update_queued`, `draft_passage_updated`, `draft_update_needs_review`. Każde musi dać się skorelować z dokumentem, wersją i operacją; same SSE nie mogą być jedynym trwałym zapisem wykonanej pracy.

## 10. Co zmienia się w logice modeli i promptach

- **Odczyt źródła:** zachowujemy istniejącego czytelnika i weryfikację cytatów. Wyjściem potrzebnym nowemu core są kandydaci konkretnych punktów oraz ich dowody.
- **Rozpoznawanie braków:** porównujemy setup z przyjętymi wartościami i kandydatami. Brak nie musi czekać na wygenerowany rozdział.
- **Dobór interakcji:** konfiguracja podaje kształt odpowiedzi i wagę; kontekst mówi, czy istnieje dowód lub konflikt. Model może przygotować wskazówki i opcje, ale nie przyznaje sobie uprawnienia do przyjęcia odpowiedzi.
- **Guidance:** uzasadnienie pokazuje, co pochodzi ze źródła, co jest założeniem i jakie są konsekwencje wariantu. Wygenerowane porady wymagają polityki przeglądu wskazanej przez właściciela produktu.
- **Drafting:** wejściem jest snapshot przyjętych punktów oraz jawne braki i założenia. Odpowiedź modelu wskazuje użyte punkty, ale kod nadal kontroluje dozwolone referencje i wersje.
- **Walidacja:** reguły policzalne i typy są sprawdzane kodem; model pozostaje potrzebny do logiki narracji, interpretacji i problemów niewyrażonych prostym równaniem. Znaleziony problem staje się zadaniem powiązanym z punktem lub osobnym problemem narracyjnym.

Jeden centralny fakt zmniejsza ryzyko rozjazdu rozdziałów, ale nie gwarantuje poprawności prozy. Tekst może być nieaktualny, model może źle go opisać, użytkownik może zmienić zdanie ręcznie, a reguła może zależeć od roku, waluty czy zakresu. Dotychczasowy reviewer nadal jest potrzebny.

## 11. Migracja w kolejnych dostawach

### Etap 0. Kontrakt i baseline

Uzgodnić pojęcia point/candidate/answer/assumption/task, reguły obowiązkowości i granice współdzielenia. Wybrać jeden rzeczywisty zamknięty przypadek oraz zestaw Krakowa i przygotować ekspercką listę potrzeb. Zmierzyć obecny Builder na tym samym wejściu. Wyniki prototypu i jego liczby nie stanowią baseline'u.

**Warunek przejścia:** znany właściciel setupu i oczekiwany zestaw punktów; nie mieszamy fact, decision i dokumentu do zdobycia.

### Etap 1. Punkty, To do i karta czatu

Rozszerzyć istniejące gapy/history albo dodać model punktów z kompatybilnym adapterem. Utworzyć punkty przed prozą, zapewnić wiele wystąpień w rozdziałach, wspólną komendę odpowiedzi oraz podstawowe confirm/answer/park. Zachować stary drafting i review jako pierwszego konsumenta.

**Warunek przejścia:** odpowiedź udzielona w czacie jest widoczna w To do po odświeżeniu; ten sam fakt nie wymaga odpowiedzi drugi raz; retry nie dubluje zdarzenia.

### Etap 2. Dokumenty według potrzeb i Overview

Dodać guidance przy tworzeniu, grupy dokumentów, source candidates, konflikty, upload z punktu i Overview. Proste porównanie oraz formularze korzystają z tego samego modelu operacji. W tym etapie obowiązuje rozróżnienie „znaleziono” i „potwierdzono”.

Podstawowe rozdzielenie working/final export należy do pierwszej wersji PRD i powinno powstać razem ze stanem wymagań. Kontrolę aktualności poszczególnych fragmentów można dołączyć po wdrożeniu etapu 4.

**Warunek przejścia:** jeden plik uzupełnia kilka kandydatów, każdy ze sprawdzalnym źródłem; konflikt nie zamyka się automatycznie; trzy następne kroki są uzasadnione.

### Wczesna próba agnostyczności

Już przy etapach 1–2 wczytać niewielki setup CAP, nawet bez pełnego modułu CAP. Wymagania eksperckie pozostają osobne, a operacje punktów, pytań, uploadu i review są te same.

**Warunek przejścia:** drugi typ nie wymaga warunków `if funder` w ogólnym core. Sam przełącznik prototypu nie spełnia tego warunku.

### Etap 3. Współdzielenie miasta

Uzgodnić role i widoczność osobistych chatów, a potem przeprowadzić spójną migrację wszystkich granic dostępu: run, pliki, punkty, propozycje i historia. Dodać przypisania oraz kontrolę równoczesnych odpowiedzi. Zasady tego etapu trzeba rozstrzygnąć w Etapie 0, nawet jeśli dostawa nastąpi później.

**Warunek przejścia:** dwaj współpracownicy widzą dozwolony wspólny dokument; odebranie dostępu blokuje kolejne odczyty i zapisy; prywatny czat nie ujawnia się przez skrót lub historię.

### Etap 4. Aktualizowanie fragmentów w tle

Dodać zależności fragment–punkt–wersja, trwałe zlecenia i ochronę ręcznych zmian. Najpierw ograniczyć zakres do kilku rozpoznawalnych fragmentów, potem rozszerzać. Zachować istniejący chapter-level fallback, gdy nie da się bezpiecznie ustalić granic fragmentu.

**Warunek przejścia:** zmiana jednego punktu aktualizuje wszystkie wskazane zależne fragmenty, nie dotyka niezależnych i nie nadpisuje nowszej ręcznej treści. UI jasno pokazuje nieaktualność.

### Etap 5. Final readiness i późniejsze wzorce

Uzupełnić istniejącą już bramkę working/final export o aktualność tekstu i oczekujące propozycje. Voice notes, rank/map/visual choice, Deep decision, rating rozdziałów, „since last visit”, programme view i linkowanie innych narzędzi pozostają późniejszym zakresem PRD. Zwykłe Compare options należy do pierwszej wersji; nie trzeba odkładać go razem z całym Deep decision.

Nie przypisuję etapom dat ani sprintów: PRD nie zawiera estymacji, a decyzje o modelu tekstu i współdzieleniu istotnie zmieniają koszt.

## 12. Jak mierzyć powodzenie

1. **Wykrywanie potrzeb:** zgodność z ekspercką listą dla tych samych materiałów; oddzielnie brakujące i niepotrzebnie dodane punkty.
2. **Poprawność uzupełnienia:** przyjęta wartość, jej jednostka, zakres i cytat są zgodne ze źródłem.
3. **Konflikty:** sprzeczne źródła pozostają widoczne do świadomej decyzji.
4. **Powtórzenia pytań:** jeden fakt używany w kilku rozdziałach nie wymaga kilku odpowiedzi.
5. **Powrót do pracy:** człowiek rozumie stan po tygodniu i znajduje następne działanie; minuta z PRD jest celem do testu użyteczności, nie osiągniętym wynikiem.
6. **Zależności tekstu:** pokrycie fragmentów, które powinny się zmienić, ochrona pozostałych i ręcznych wersji.
7. **Współpraca:** dostęp współpracownika, cofnięcie uprawnień, równoczesna odpowiedź i brak wycieku prywatnego czatu.
8. **Powtórzenie operacji i awaria:** retry odpowiedzi, przerwane generowanie i stary wynik workera zachowują jeden poprawny stan.
9. **Drugi typ dokumentu:** CAP działa przez konfigurację; test obejmuje te same operacje i porównywalne scenariusze.

PRD stwierdza, że dotychczasowy benchmark nie obejmuje całego nowego celu i że ostatni przywołany run nie przeszedł ogółem. Nie uruchamiano nowego benchmarku w tej analizie. Ekstrakcja, pisanie i edycja pozostają przydatnymi podtestami, ale nie zastąpią pomiaru punktów, pracy odłożonej i współdzielenia.

## 13. Decyzje przed implementacją

**Piotr według PRD:** migracja w obecnym Builderze czy nowy workspace/rebuild; miejsce core i drugi typ dokumentu; zakres i moment benchmarku; city ownership, chaty i równoczesne zmiany; mapowanie fragmentów do punktów oraz aktualizacja chronionego tekstu.

**Produkt i eksperci według PRD:** kto pisze i zatwierdza setup każdego typu; dla C40 pilot autor wskazuje finance experts, a właściciel CAP pozostaje do wskazania; jaki przegląd przechodzą generowane wskazówki.

**Doprecyzowania wynikające z mapowania:** jak grupować duplikaty semantyczne dawnych gapów; kto może oznaczać obowiązkowe wymaganie jako assumption/not applicable; co dzieje się po cofnięciu dowodu; jak zmiana setupu wpływa na rozpoczęty run; co UI pokazuje pomiędzy zapisem punktu a aktualizacją tekstu; czy final export wymaga zaakceptowania wszystkich oczekujących zmian; jak rozróżnić źródło decyzji od źródła faktu.

Współdzielenie miasta jest opisane jako pożądane zachowanie, lecz nie jest wyszczególnione w krótkiej liście „First version”. Zakres tej dostawy trzeba potwierdzić. Tak samo potrzebna jest polityka dla punktów automatycznie pokrytych ze źródła oraz tych wymagających potwierdzenia przez człowieka.

## 14. Mapa kodu do dalszej pracy

Referencje dotyczą commita `e16b8f04734fbbc68aeed3d44e429dac8113e8ab`.

- [Workspace i trzy obecne zakładki](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteWorkspace/index.tsx#L65) — miejsce integracji Overview i To do.
- [Dialog tworzenia](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteDashboard/new-concept-note-dialog.tsx#L73) — guidance i wczesny wybór konfiguracji.
- [Context](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteWorkspace/context-tab.tsx#L322) — grupy potrzeb i materiały.
- [Formularz gapu](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteWorkspace/gap-answer-form.tsx#L75) i [przekazanie odpowiedzi do czatu](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteWorkspace/chat-panel.tsx#L389) — aktualny wzorzec odpowiedzi.
- [Modele gapów i ich rozstrzygnięć](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/models/db/cnb_workspace.py#L203) — baza migracji punktów i historii.
- [Zapis gapów przy generowaniu rozdziału](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/persistence/concept_notes/workspace.py#L138) — obecne powiązanie braku z prozą.
- [Rekonsyliacja gapów po nowym źródle](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/persistence/concept_notes/gaps.py#L250) — zachowanie i ponowne otwieranie odpowiedzi.
- [Czytanie wybranego źródła](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/tools/concept_note_source_tools.py#L37) — współdzielony reader, kontrola artefaktu i dowodów.
- [Selektywne redrafty rozdziałów](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/services/cnb/chapter_drafting.py#L317) — obecny poziom aktualizacji.
- [Autoryzacja właściciela runu](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/persistence/concept_notes/context_bundle.py#L813) — jedna z granic do przebudowy dla miasta.
- [Idempotencja i wersje przy apply](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/persistence/concept_notes/edits.py#L256) — wzorzec współbieżności do zachowania.
- [Obecna polityka eksportu](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/app/src/components/ConceptNoteWorkspace/concept-note-export.ts#L101) — acknowledgement zamiast final gate.
- [Evidence links](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/e16b8f04734fbbc68aeed3d44e429dac8113e8ab/climate-advisor/service/app/models/db/cnb_workspace.py#L182), `workspace_validation.py` i `workspace_rows.py:112` — istniejący model/odczyty/kopiowanie, do odróżnienia od grafu fragmentów.

## 15. Materiały wizualne i weryfikacja

Raport interaktywny i zrzuty prototypu znajdują się lokalnie w `output/jvp-agentic-flow-report-20261115/`. Schemat obecnego UI jest rekonstrukcją z kodu, a schemat backendu i symulacja aktualizacji są propozycją mapowania. Zrzuty z prototypu są podpisane jako prototyp JVP, nie jako wdrożone CityCatalyst.

Zweryfikowano treść PRD, interakcje wskazane w sekcji 2 i przywołane miejsca w kodzie. Nie zmieniano kodu aplikacji, migracji ani promptów. Nie uruchamiano płatnych modeli i benchmarków ani nie sprawdzano wdrożenia.

Modern Web Guidance zastosowane w warstwie raportu: `html` — natywne rozwijanie szczegółów, zgodnie z regułą „use `<details>` and `<summary>` for a native disclosure pattern without JS”; `responsive-design` — proporcje obrazów i reflow, zgodnie z regułą „Use `aspect-ratio` for media elements”. Nie użyto viewport-height dla rozmiaru raportu osadzonego w rozmowie.
