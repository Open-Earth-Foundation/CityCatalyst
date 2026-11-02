# UB03-r3 — Co naprawdę oznaczają zakresy w energii

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:58:07.765Z — 2026-11-01T10:58:46.031Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

W wynikach za 2024 rok chcę lepiej zrozumieć energię stacjonarną. Ile przypada na zakres 1, a ile na zakres 2?

## Clima 1

W inwentaryzacji za 2024 r. energia stacjonarna wynosi łącznie **900 000 tCO₂e** (50% całkowitych emisji miasta):

- **Zakres 1:** **600 000 tCO₂e** — **66,7%** emisji energii stacjonarnej  
- **Zakres 2:** **300 000 tCO₂e** — **33,3%** emisji energii stacjonarnej  

Obie wartości dotyczą przede wszystkim budynków mieszkalnych.

Czas do końca odpowiedzi (wraz z UI): 10.9 s.

## Użytkownik 2

Jak mam prostym językiem wyjaśnić przełożonej różnicę między tymi zakresami?

## Clima 2

Najprościej:

- **Zakres 1** to emisje powstające **na miejscu**, np. gdy w budynkach spalany jest gaz, węgiel lub olej opałowy na ogrzewanie i ciepłą wodę.  
- **Zakres 2** to emisje związane z **energią kupowaną z zewnątrz** — głównie prądem (a czasem także kupowanym ciepłem lub chłodem). Emisje fizycznie powstają u producenta energii, ale przypisujemy je odbiorcy, który tę energię zużywa.

Możesz powiedzieć przełożonej:

> „W energii stacjonarnej zakres 1 pokazuje paliwa spalane bezpośrednio w budynkach, a zakres 2 — emisje związane z prądem i inną energią, którą budynki kupują. W 2024 r. około dwie trzecie tych emisji pochodziło ze spalania paliw na miejscu, a jedna trzecia z zakupionej energii elektrycznej.”

W liczbach: **600 tys. tCO₂e w zakresie 1** i **300 tys. tCO₂e w zakresie 2**.

Czas do końca odpowiedzi (wraz z UI): 9.5 s.

## Użytkownik 3

Czy te liczby składają się na cały wynik energii i czy oznacza to, że nie brakuje nam tam żadnych danych?

## Clima 3

Tak — **600 tys. tCO₂e (zakres 1) + 300 tys. tCO₂e (zakres 2) = 900 tys. tCO₂e**, czyli cały obecnie wykazany wynik dla sektora energii stacjonarnej.

Nie oznacza to jednak, że sektor jest kompletny. Dla energii stacjonarnej wypełniono **2 z 21 wymaganych pozycji danych** (około **10%**), a **19 pozycji nadal brakuje**. Te dwie wprowadzone pozycje są danymi ręcznie dodanymi lub zaimportowanymi.

Czyli: suma zakresów zgadza się z obecnym wynikiem sektora, ale wynik może się zmienić po uzupełnieniu brakujących kategorii.

Czas do końca odpowiedzi (wraz z UI): 10.7 s.
