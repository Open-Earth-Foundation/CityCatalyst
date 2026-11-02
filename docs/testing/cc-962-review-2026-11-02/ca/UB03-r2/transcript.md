# UB03-r2 — Co naprawdę oznaczają zakresy w energii

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:57:58.529Z — 2026-11-01T10:58:37.591Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

W wynikach za 2024 rok chcę lepiej zrozumieć energię stacjonarną. Ile przypada na zakres 1, a ile na zakres 2?

## Clima 1

Dla inwentaryzacji za 2024 r. energia stacjonarna wynosi łącznie **900 000 tCO₂e** (50% całkowitych emisji miasta).

- **Zakres 1:** **600 000 tCO₂e** — 66,7% emisji energii stacjonarnej  
- **Zakres 2:** **300 000 tCO₂e** — 33,3% emisji energii stacjonarnej  

Widoczne emisje w obu zakresach dotyczą przede wszystkim budynków mieszkalnych.

Czas do końca odpowiedzi (wraz z UI): 10.9 s.

## Użytkownik 2

Jak mam prostym językiem wyjaśnić przełożonej różnicę między tymi zakresami?

## Clima 2

Najprościej:

- **Zakres 1** to emisje powstające **bezpośrednio na miejscu** — np. gdy mieszkańcy spalają gaz, węgiel lub olej opałowy do ogrzewania budynków.
- **Zakres 2** to emisje związane z **energią kupowaną z zewnątrz**, głównie z prądem i ciepłem sieciowym. Emisje fizycznie powstają w elektrowni lub ciepłowni, ale są przypisane odbiorcom tej energii.

Możesz powiedzieć przełożonej:

> „W energii stacjonarnej zakres 1 pokazuje emisje z paliw spalanych bezpośrednio w budynkach, a zakres 2 — emisje związane z zakupionym prądem i ciepłem. W 2024 r. większa część emisji energii stacjonarnej pochodziła ze spalania paliw na miejscu: 600 tys. tCO₂e, wobec 300 tys. tCO₂e z energii kupowanej.”

Czas do końca odpowiedzi (wraz z UI): 9.1 s.

## Użytkownik 3

Czy te liczby składają się na cały wynik energii i czy oznacza to, że nie brakuje nam tam żadnych danych?

## Clima 3

Tak — **600 tys. tCO₂e w zakresie 1 + 300 tys. tCO₂e w zakresie 2 = 900 tys. tCO₂e**, czyli cały obecnie wykazany wynik dla energii stacjonarnej.

Nie oznacza to jednak, że sektor jest kompletny. W energii stacjonarnej uzupełniono **2 z 21 wymaganych pozycji danych** (ok. **10%**); **19 pozycji pozostaje brakujących**. Obecny wynik opiera się na danych ręcznie wprowadzonych lub przesłanych, dotyczących budynków mieszkalnych.

Można więc powiedzieć: *„Zakresy 1 i 2 sumują się do całego wyniku, który mamy obecnie w systemie, ale nie do pełnego obrazu energii stacjonarnej — trzeba jeszcze uzupełnić brakujące kategorie.”*

Czas do końca odpowiedzi (wraz z UI): 11.8 s.
