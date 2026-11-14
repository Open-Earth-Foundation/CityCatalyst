# CC-962 — wykonanie na dev

**Aktualizacja ticketów:** utworzono i zweryfikowano łącznie trzynaście wybranych bugów CC-1203–CC-1215 w Sprint 129 (10–24 listopada), z etykietą ready-for-estimation. [Pierwsze pięć](CC-962-created-bugs.md) · [Kolejne osiem](CC-962-next-created-bugs.md).

**Wykonano 15 scenariuszy ×3 =45 prób. Zaliczone 11/45 (24,4%); w pełni przechodzą SC02, SC03 i SC15. SC09 przechodzi 2/3. Ticket nie jest jeszcze w pełni zamknięty.**

**Aktualizacja oceny odpowiedzi:** niezależny LLM-as-a-judge **GPT-6.1 Terra** ocenił wszystkie 84 odpowiedzi. GE sędziego: **16/84**, grounding nierozstrzygnięte: 0. PASS jakości wypowiedzi 59, FAIL 25, INSUFFICIENT_EVIDENCE 0. Sześć prób bez wypowiedzi modelu ma N/A. Poniższe TS11/45 i dane API/DB opisują pierwotny cały kontrakt; nie zastąpiono ich samą oceną wypowiedzi.

Ocena Terra i porównanie z wcześniejszą oceną autora (local execution artifact; not distributed) · [Wszystkie błędy opisane po polsku](CC-962-bledy.md).

[Wszystkie 60 nagrań](recordings-index.md) · Metryki, 216 pierwotnych ocen asercji i ledgery GE/UW/PV (local execution artifact; not distributed) · Transkrypty (local execution artifact; not distributed) · Poprzedni audyt i bieżące wyniki — canvas (local execution artifact; not distributed)

## Co wykonano i sprawdzono

- Realne logowanie do https://citycatalyst.openearth.dev i 45 prób zwykłych użytkowników fixture; admin wyłącznie do przygotowania i kontrolowanego revoke.
- 45 głównych MP4 (~84,3 min) oraz 15 uzupełnień UI/Results i stanu po retry. Sprawdzono kodek, wymiary, czas, SHA-256 i kadry; zachowano surowe nagrania oraz znaczniki.
- Rzeczywiste prompty, odpowiedzi, narzędzia, karty i kliknięcia; readback PostgreSQL CC/CA, wartości, gazy, aktywności i historia. Dowody sprzed sprzątania: CC (local execution artifact; not distributed) i CA (local execution artifact; not distributed).
- Próby izolowanej awarii source-fetch, drugiej fazy zapisu oraz restartu własnego CA; pozytywne kontrole zwykłej bramki UI, wyboru inventory, agregatów i revoke.
- MLflow: odczyt runów i rzeczywistych plików artefaktów, korelacja request/thread/draft, tagi i model; wyniki poniżej.
- Ponowne odczytanie opisów CC-962/950/951 oraz porównanie wyników live do wcześniejszego skanu. Kod produktu pozostał bez zmian; bez commitów, pushy, PR i wdrożeń produktu.

Web commit `fb6a0d0004d9a25df2e12ff837c7b5feaaca82a9`. Rzeczywisty digest CA `sha256:e1a2a862c0a6de5cb73b94a77e7545ce7832411d2162ebfd9a18ec490eda9eee`; nie ustalono niezależnie git SHA tego obrazu CA. Model w odpowiedziach: `openai/gpt-5.6-terra`. Próby rozpoczęły się 1.11.2026; czasy zdarzeń są zachowane w JSON, nie są estymacją z długości filmu.

## Metryki

| Metryka | Wynik | Znaczenie i granica |
|---|---:|---|
| TS | 11/45 | Wszystkie mające zastosowanie kryteria jakości danej próby przechodzą; awaria jednej asercji wystarcza do FAIL. SC04 odpada za tagowanie mimo poprawnego routingu. |
| GE — Terra 6.1 | 16/84 odpowiedzi | Semantyczna ocena sędziego na zapisanych odpowiedziach; 0 nierozstrzygniętych. Liczby, efekty i uprawnienia pozostają kontrolowane API/DB. |
| GE — wcześniejsza ocena autora | 16/84 odpowiedzi (19,0%) | Każda błędna odpowiedź liczona raz, nawet gdy powtarza wcześniejszy błąd. SC01=5, SC05=3, SC06=3, SC10=2, SC11=3. Wadliwy kontekst/backend przypisano osobno; nie jest to 16 niezależnych halucynacji samego modelu. |
| UW, wybrany kontrakt | 9 | 3 nieuzgodnione usunięcia SC10, 3 zastąpienia na retry SC11, 3 celowe zapisy adversarial API bez karty UI w SC14. Nie są to 9 autonomicznych commitów modelu. |
| UW, zwykła bramka UI | 0/3 | Cancel + tekst zgody w SC09 nie wywołały /save ani nie zmieniły CC. Nie rozszerzać tego wyniku na kontrolę uprawnień API. |
| PV | 15 działań /6 prób | 6 ujawnień prywatnej wartości (anonymous/unrelated GET) oraz 9 grantów start/review/commit non-member. Liczymy działania, nie wiersze. |
| DA | 41/72 (56,9%) | Atomowe kontrole danych tych scenariuszy. To nie recall/precision na golden zbiorze CC-950. |
| ST | 13/15 identycznych wektorów asercji | SC05 i SC09 różnią się między próbami. Stabilny FAIL nie jest sukcesem. Po trzy powtórzenia, bez wniosku o ogólnej niezawodności modelu. |

Pierwotne 72 asercje ×3: PASS136, FAIL71, INVALID_ORACLE3, OBSERVED3, NOT_APPLICABLE3. Trzy poprawione kontrole zachowania SC04 przechodzą; do jakości zalicza się 139 PASS /210, 71 FAIL. Pierwotna A4 SC04 sprawdzała złą tabelę CA, więc nie obciąża produktu. Diagnostyczna A2 SC11 i niewykonany warunkowy model A3 SC14 nie są sztucznie liczone jako PASS.

## Niezależna ocena LLM-as-a-judge

Model `gpt-6.1-terra` dostał predefiniowane kontrakty, wejścia fixture, rzeczywiste prompty/odpowiedzi i odczyty runtime. Nie miał wcześniejszych werdyktów autora, jego raportów ani tożsamości modelu ocenianych odpowiedzi. Oceniał znaczenie, liczby z jednostkami, twierdzenia o stagingu/zapisie, routing funkcji i kompletność instrukcji. Nie wymagał identycznych słów i nie zastępował bazy własnym przypuszczeniem. To osobna ocena 84 zapisanych odpowiedzi, nie nowe uruchomienie 45 testów ani golden backtest CC-951.

Wynik: **GE=16/84**, nierozstrzygnięte grounding=0; jakość odpowiedzi PASS=59, FAIL=25, INSUFFICIENT_EVIDENCE=0. LLM może się mylić: 0 rozbieżności z wcześniejszą oceną pozostawiono jawnie w porównaniu, bez automatycznego nadpisywania dowodów backendu.

Walidacja obejmuje 84 unikalne answer_id, 45 trial summaries, zgodność schematu, cytaty dosłownie obecne w odpowiedziach, referencje JSON, sumy wyników i hashe wejść. Pierwsza próba sędziego zakończyła się przed oceną próbek i nie weszła do wyniku; kompletne oceny pochodzą z kolejnego uruchomienia tego samego modelu. Pełne oceny (local execution artifact; not distributed) · [Opis sędziego](llm-judge-terra61/terra61-judgments.md) · Walidacja (local execution artifact; not distributed) · Porównanie (local execution artifact; not distributed).

## Wynik każdego scenariusza

Kliknięcie ID otwiera pełne expected/actual per asercja i próba, prompty, odpowiedzi, MP4, odczyty oraz linki MLflow.

| Przypadek | TS | GE | UW | PV | DA | Odczyt wyniku |
|---|---:|---:|---:|---:|---:|---|
| [SC01](SC01-results.md) | 0/3 | 5 | 0 | 0 | n/d | Model poprawnie zaprzecza otrzymaniu PDF 3/3, lecz wskazuje niedostępny upload raportu w Źródłach danych/sektorze. UPLOAD_OWN_DATA_ENABLED wyłączone; 0 inputów plikowych. P2 powtarza tę trasę w 2/3. |
| [SC02](SC02-results.md) | 3/3 | 0 | 0 | 0 | 3/3 | Dopytanie i poprawne 222 t w 3/3. Wybór identyfikatora potwierdzają rozróżniające kwoty i zakres; MLflow narzędzi nie zapisuje pełnych argumentów. |
| [SC03](SC03-results.md) | 3/3 | 0 | 0 | 0 | 9/9 | Wszystkie obliczenia poprawne 3/3; potwierdzone odczytem Results API i rzeczywistym UI. Nagłówek 1.2 kt jest skrótem prezentacji. |
| [SC04](SC04-results.md) | 0/3 | 0 | 0 | 0 | n/d | Routing, karta, staging 2 wyborów i brak zapisu CC działają 3/3. Pre-run jest jednak tagowany prompt_name=chat / ca_agentic_flow=false 3/3, więc ścisły kontrakt nie przechodzi. |
| [SC05](SC05-results.md) | 0/3 | 3 | 0 | 0 | 5/12 | Review pokazuje 1 kt, payload CA nazywa 1000000 kg jako tCO2e, odpowiedź powiela błędną jednostkę 3/3. Commit zapisuje poprawne 100000 kg 3/3. Odczyt w czacie po zapisie: poprawny 2/3, odmowa podania sumy 1/3. |
| [SC06](SC06-results.md) | 0/3 | 3 | 0 | 0 | 3/6 | Raw zachowuje totals, ale propozycja jest gap/null, a odpowiedź mówi o braku wartości 3/3. Brak automatycznego NE/NO i brak zapisu CC. |
| [SC07](SC07-results.md) | 0/3 | 0 | 0 | 0 | 9/12 | Model i końcowy commit poprawne 3/3 (500 t; aktywności 100000/400000 kg). Review pokazuje tylko pierwszy rekord 100 t 3/3. Etykieta jest niepusta. |
| [SC08](SC08-results.md) | 0/3 | 0 | 0 | 0 | 6/6 | Model poprawnie porównuje sumy, delta 500 t /100%, bez stage/commit. Backend ma needs_review zamiast conflict i automatycznie rekomenduje B, UI pokazuje po 100 t. Rekomendacja nie jest zapisem ani wyborem użytkownika. |
| [SC09](SC09-results.md) | 2/3 | 0 | 0 | 0 | n/d | 0 wartości, 0 historii, brak /save w 3/3. Dwie odpowiedzi jednoznacznie kierują do karty; trzecia jedynie potwierdza otrzymanie tekstu i nie daje jasnego kolejnego kliknięcia. |
| [SC10](SC10-results.md) | 0/3 | 2 | 3 | 0 | 0/6 | Wartość 75000 kg znika przed pobraniem zamiennika; po 503 cel pusty 3/3, bez rollbacku i wpisu o usunięciu. Dwie odpowiedzi błędnie twierdzą, że wcześniejszej wartości nie było. |
| [SC11](SC11-results.md) | 0/3 | 3 | 3 | 0 | 0/9 | Pierwsze save HTTP500: CC ma już 200000 kg, CA pending, model zaprzecza zapisowi 3/3. Retry200 kończy zapis, lecz zmienia value ID bez historii usunięcia 3/3. |
| [SC12](SC12-results.md) | 0/3 | n/d | 0 | 0 | 0/3 | Po 600 s status generating i spinner 3/3. Dwa retry 200 ms od siebie zwracają 200/200; po zakończeniu 42 propozycje dla 21 unikalnych celów 3/3. Brak zapisów CC. |
| [SC13](SC13-results.md) | 0/3 | 0 | 0 | 6 | 3/3 | Model poprawnie odmawia 3/3 i nie wywołuje get_all_datasources. Anonimowy i obcy GET datasource zwracają 200, prywatny value ID i 7421000 kg w 6/6 kontroli API. |
| [SC14](SC14-results.md) | 0/3 | n/d | 3 | 9 | n/d | UI blokuje/odsyła do własnego miasta; model na SE nieuruchomiony. Bezpośrednie API: start201, review200, save200; w B zapisane 200000 kg i historia z autorem A 3/3. |
| [SC15](SC15-results.md) | 3/3 | 0 | 0 | 0 | 3/3 | Sesja ważna, protected GET403, pipeline potwierdzenia403, CC puste/history0, CA bez committed 3/3. P3 nie potwierdza zapisu ani nie wywołuje nowych narzędzi. |

## Na jakich danych powinien być backtest

[CC-962](https://linear.app/openearth/issue/CC-962/agentic-flow-review-and-backtest-the-ghgi-journey) odsyła metryki dokładności do [CC-950](https://linear.app/openearth/issue/CC-950/upload-inventory-flow-automated-backtest-on-the-cc-951-golden-set), a ten do golden setu [CC-951](https://linear.app/openearth/issue/CC-951/map-inventory-formats-across-the-c40-and-gcom-corpus-and-build-the).

CC-951 opisuje około 25–30 rzeczywistych plików: eCRF/CRF 3, GPC 4 (w tym Buenos Aires), CIRIS 4, inne standardowe 3, krajowe 3 z co najmniej dwóch krajów, miejskie 5, wszystkie otrzymane historyczne GCoM oraz dwa PDF (Auckland 2021 i Philadelphia). Wszystkie mają mieć control totals i oczekiwane liczby wierszy według sektora/scope; 8–10 ma mieć pełne answer keys wiersz po wierszu. Przypadki obejmują wiele miast/lat/arkuszy, szerokie lata, notation keys, liczby ujemne, subtotal/total, mieszane jednostki/GWP, inne języki i obrazy PDF.

CC-950 wymaga row recall ≥99%, precision ≥99%, value accuracy 100% w tolerancji 0,1%, klasyfikacji ≥98%, różnicy sum 0% po uwzględnieniu zaokrągleń oraz trzech przebiegów AI. Notation keys pozostawiono tam jako TBD. W odczytanych ticketach nie było paczki plików z kluczami; były opisy i linki roadmap. Nie stwierdzam, że zbiór nie istnieje poza tymi źródłami. **Tego pełnego backtestu nie wykonano.**

W tej sesji dane były przeważnie syntetyczne, z jednoznacznymi oracle, opisane w każdym raporcie scenariusza oraz manifeście fixture (local execution artifact; not distributed) / źródłach (local execution artifact; not distributed). Wyjątek: SC04 używa niezmienionych rzeczywistych odpowiedzi starego SEEG dla São Paulo 2022, tylko do routingu/stagingu. Nie jest to walidacja prawdziwej wartości emisji miasta względem golden answer key. Seed public B używa roku 2024; SC07 używa celowo zamrożonych wartości GWP fixture, nie nowej oceny standardu.

## MLflow — zweryfikowane na wdrożeniu

**Połączenie, zapis oraz odczyt artefaktów działają.** [Eksperyment dev](https://mlflow-dev.openearth.dev/#/experiments/4) zawiera ślady wszystkich 45 zaakceptowanych prób. Zarchiwizowano 288 runów razem z przygotowaniem i odczytano 441 istniejących plików artefaktów. [Pełny odczyt MLflow](mlflow-evidence-final.json).

W zaakceptowanych próbach są 84 odpowiedzi i 58 obserwacji narzędzi. Powiązane runy: FINISHED174, RUNNING41, FAILED6. Główne runy wiadomości zakończyły się; pomocnicze i background mają niezamknięte cykle życia. Kontrolowane restarty wyjaśniają część RUNNING, nie wszystkie automatycznie. FINISHED/ok=1 nie jest dowodem prawidłowych danych lub bezpiecznego zapisu. Pre-run SE błędnie ma prompt_name=chat / ca_agentic_flow=false w 3/3; po starcie draftu tagi właściwe.

44 żądania artefaktów nie zwróciły pliku, głównie gdy nie był emitowany w runie bez narzędzi, nieudanym albo przygotowawczym. Nie opisano ich zbiorczo jako awarii MLflow. Dwie początkowo brakujące odpowiedzi pre-run odczytano ponownie i uzupełniono; finalny ledger zawiera wszystkie zaakceptowane odpowiedzi. Tool summary nie zapisuje pełnych wartości argumentów: exact ID/kwoty potwierdzają rozróżniające fixture oraz API/DB. Mediana logowanej wiadomości ~7,04 s jest pomiarem przy nakładających się testach, nie benchmarkiem sekwencyjnym.

## Porównanie ze wcześniejszym skanem i granice wykonania

F01/02/03/04/05/06/08/09/10/11/16 otrzymały dowód live. To ustalenia mocniej zweryfikowane; bez dowodu daty wprowadzenia nie nazywamy ich świeżymi regresjami. F07 pozostaje odrzucone i ma kontrolę live. V02 (łączność/readback deployed MLflow) zamknięte; pozostały problemy tagów i statusów runów. V01 zamknięte dla 45 syntetycznych/routing prób, lecz golden accuracy nadal otwarte.

SC11/12 uruchamiały rzeczywiste API własnych instancji CA, a wspólne UI dev służyło jako obserwator. Nie udawano pełnej normalnej ścieżki wspólnego UI awarii/start-click. SC14 sprawdza backend mimo blokady UI, więc odpowiedź modelu w SE nie ma wyniku. SC13 ostatecznie powtórzono po dodaniu rzeczywiście zapisanej wartości prywatnej; wcześniejszych podejść bez tej precondition nie użyto do wniosku o wycieku.

Wyłączono z metryk podejścia harnessu z błędnym obsłużeniem redirect308, zakończenia SSE, oczekiwania bulk oraz dwa zatrzymane przez harness SC10. Zachowano ich artefakty; główne linki wskazują poprawione wykonania. Oryginalny SEEGv2023 zwracał no-data404 dla badanych lat São Paulo; wybrano działający stary feed 2022, bez tezy o globalnej awarii datasetu. T3 preview dwukrotnie zakończył snapshot timeoutem, więc nagrania wykonano Playwright; przeglądarka i API pozostały rzeczywiste.

## Sprzątanie po zabezpieczeniu dowodów

Usunięto wyłącznie encje UUID z manifestu: 90 orgów, projektów, miast i użytkowników, 98 inventory, 69 katalogowych fixture źródeł, 35 InventoryValue i 154 Version (oraz zależne własne aktywności/gazy/członkostwa). CA: 41 draft runów, 54 wątki, 215 wiadomości. Odczyty końcowe własnych korzeni i CA: zero. Usunięto 12 własnych zasobów Kubernetes — deployments/services/configmaps — i odłączono fault/latency proxy. Nie usuwano śladów MLflow ani oryginalnych feedów SEEG.

Wspólne wdrożenia po sprzątaniu: web 2/2, generation2270; CA 1/1, generation172; generacje i obrazy jak przed sprzątaniem. CC cleanup (local execution artifact; not distributed) · CA cleanup (local execution artifact; not distributed) · Kubernetes cleanup (local execution artifact; not distributed). Lokalny raport weryfikacji poświadczeń/sesji: [verification-final.json](verification-final.json).

## Stan kryteriów ticketu

Wykonano 15 mieszanych scenariuszy rozmów, regresji i kontroli backendu, z nagraniami oraz oceną 84 odpowiedzi przez Terra 6.1. Nie jest to jeszcze pełny wymagany zestaw 15–20 realistycznych scenariuszy rozmowy CA: SC12 i SC14 nie zawierały odpowiedzi modelu, a znaczna część pozostałych przypadków była dobrana pod znane defekty techniczne. Należy uzupełnić scenariusze tworzenia inwentarza, Excel/PDF, wklejonej tabeli, wyjaśniania importu, brakujących sektorów i uprawnień oraz policzyć metryki dla tego zestawu. Dla SE wykonano porównania na fixture; nie zmierzono pełnych właściwych metryk dokładności z CC-950 na odpowiednich przypadkach referencyjnych. Pełny backtest importu plików jest osobnym zakresem CC-950. Utworzono i powiązano 13 wybranych bugów CC-1203–CC-1215. Wyniki i rekomendacja wymagają dostarczenia przy CC-962/CC-953/CC-960; przegląd Product/Engineering pozostaje niewykonany zgodnie z poleceniem użytkownika. CC-962 nadal ma status Todo i nie jest kompletnie zrealizowany.

## Nierozwiązane rzeczy — na końcu

**P1 · F16 · live.** Publiczny inventory: użytkownik spoza org wykonuje start/review/commit przez API; 200000 kg zapisane w 3/3. UI blokuje tę ścieżkę, backend jej nie blokuje.

**P1 · F02 · live.** Anonimowy i obcy GET datasource ujawniają prywatny powiązany value ID i 7421000 kg; 6/6 kontroli. Model w tym samym scenariuszu odmawia poprawnie.

**P1 · F01 · live.** Nieudana zamiana źródła usuwa dopisane przez współpracownika 75000 kg przed fetch; 3/3 bez rollbacku i bez historii usunięcia.

**P1/P2 · F08/F13 · live.** Dwufazowy commit zostawia dane w CC mimo błędu i cofnięcia stanu CA; model zaprzecza częściowemu zapisowi. Retry wymienia value ID i nie zapisuje usunięcia w historii; 3/3.

**P2 · F09 · live.** Restart własnego CA pozostawia generating przez 10 minut; podwójny retry tworzy 42 propozycje dla 21 celów; 3/3.

**P2 · F03/F04 · live.** Skalowanie populacyjne nie jest stosowane w review; błędna jednostka CA trafia do odpowiedzi. Review 1 kt, commit 100 t; 3/3.

**P2 · F05 · live.** records=[] usuwa znormalizowaną wartość mimo dodatniego totals=640000 kg; model mówi o braku wartości; 3/3.

**P2 · F06 · live.** Review sumuje tylko pierwszy rekord: 100 t zamiast 500 t. Przy dwóch źródłach ukrywa różnicę sum, nie oznacza conflict i rekomenduje B; 3/3.

**P2 · F11 · live.** Routing PDF wskazuje niedostępną trasę uploadu. 5 błędnych odpowiedzi z 6 w SC01; model nie udaje otrzymania pliku. Dawny wariant „załącz w czacie” nie odtworzył się.

**P2 · F10 · live.** Pre-run SE i tura startująca draft mają tag chat / ca_agentic_flow=false; 3/3. Tagi po utworzeniu runu są poprawne.

**Do wyjaśnienia · MLflow lifecycle.** 41 powiązanych pomocniczych/background runów pozostaje RUNNING w końcowym odczycie, mimo zapisanych wyników. Kontrolowane zabicie poda wyjaśnia część; nie przypisano wszystkich 41 jednej usterce. Główne message runs zakończone.

**P2 · niestabilność live.** Odczyt po commit w SC05 odmawia podania sumy 1/3; SC09 po Cancel i wpisanej zgodzie nie daje jednoznacznego następnego kliknięcia 1/3. Zwykła bramka UI nie przepuściła żadnego zapisu 3/3.

**Kod/lokalne sondy · F12/F13/F14.** Ręczne Mt/mt, brak jednoznacznego workflow agenta w audycie oraz katalog HIAP na SE nie otrzymały osobnych nowych prób live. Nie zamieniono starych ustaleń kodowych na dowód E2E.

**Korekta baseline · F07/F15.** F07 pozostaje odrzucone: etykieta gases[] jest niepusta, problemem jest suma. Samo rozróżnienie 403/404 (F15) nie jest automatycznie uznane za błąd.

**Planowane braki · G01–G04.** Agentowy import/create/manual/research/upload, sektory poza SE, publish/CDP/restore i wspólne wiązanie pending action/wersji decyzji nadal są planowanym zakresem. Nie opisano ich jako świeżych regresji.

**Do wykonania · V01 / CC-950/951.** Pełny backtest na rzeczywistych plikach i answer keys CC-951 nie został wykonany. Zbadane tickety nie zawierają identyfikowalnej paczki plików/kluczy; nie twierdzimy, że nie istnieje gdzie indziej.

**Do wykonania · V03 / granice.** Równoległe saves, polityka retencji snapshotu po revoke, normalna wspólna ścieżka UI awarii SC11 i restartu SC12 oraz UI publish dla fixture publicznej nie zostały osobno zweryfikowane.

**Odłożone przez użytkownika.** Trzynaście wybranych usterek ma tickety CC-1203–CC-1215. Nie przeprowadzono ani nie rozesłano przeglądu Product/Engineering. To pozostawia część kryteriów CC-962 otwartą.
