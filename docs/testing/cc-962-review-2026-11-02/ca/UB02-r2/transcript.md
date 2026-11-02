# UB02-r2 — Porównanie roczne bez mylenia wzrostu z przyczyną

Dev: https://citycatalyst.openearth.dev. Konto: zwykły współpracownik miasta. Stan: completed.
Przebieg: 2026-11-01T10:56:41.185Z — 2026-11-01T10:57:18.851Z.

[Nagranie](MEDIA_PENDING) · Pełny dowód JSON (local execution artifact; not distributed)

## Użytkownik 1

Przełożona pyta, jak zmieniły się emisje naszego miasta między inwentaryzacjami 2023 i 2024. Możesz to porównać?

## Clima 1

Porównałem inwentaryzacje Brzegu Nadziei za 2023 i 2024 (obie: GPC Basic+ z wartościami GWP AR6).

**Łączne emisje wzrosły z 1,50 mln tCO₂e w 2023 r. do 1,80 mln tCO₂e w 2024 r.**  
To wzrost o **300 tys. tCO₂e**, czyli **20%**.

| Sektor | 2023 | 2024 | Zmiana |
|---|---:|---:|---:|
| Energia stacjonarna | 750 tys. tCO₂e | 900 tys. tCO₂e | +150 tys. tCO₂e (+20%) |
| Transport | 500 tys. tCO₂e | 600 tys. tCO₂e | +100 tys. tCO₂e (+20%) |
| Odpady | 250 tys. tCO₂e | 300 tys. tCO₂e | +50 tys. tCO₂e (+20%) |

Struktura emisji nie zmieniła się: energia stacjonarna nadal stanowi **50%** całości, transport **33,3%**, a odpady **16,7%**. Największymi pojedynczymi źródłami w 2024 r. były emisje z budynków mieszkalnych (zakres 1) oraz transport drogowy — po **600 tys. tCO₂e**.

Warto zaznaczyć, że w obu latach dane są wprowadzone ręcznie lub zaimportowane; sektory IPPU i AFOLU nie mają wypełnionych danych.

Czas do końca odpowiedzi (wraz z UI): 12.2 s.

## Użytkownik 2

O ile to się zmieniło w tonach i w procentach względem 2023 roku?

## Clima 2

Łączne emisje wzrosły o **300 000 tCO₂e** — z **1 500 000 tCO₂e** w 2023 r. do **1 800 000 tCO₂e** w 2024 r.

To oznacza wzrost o **20% względem 2023 r.**

Również sektorowo wzrost wyniósł 20%:
- **Energia stacjonarna:** +150 000 tCO₂e
- **Transport:** +100 000 tCO₂e
- **Odpady:** +50 000 tCO₂e

Czas do końca odpowiedzi (wraz z UI): 8.2 s.

## Użytkownik 3

Czy na tej podstawie mogę stwierdzić, że mieszkańcy zużyli więcej energii? Co powinnam zaznaczyć w notatce?

## Clima 3

Nie wprost. Na podstawie tych danych możesz stwierdzić, że **raportowane emisje z energii stacjonarnej wzrosły o 150 000 tCO₂e (20%)** — z 750 000 do 900 000 tCO₂e.

Nie jest jednak bezpieczne stwierdzenie, że mieszkańcy na pewno zużyli więcej energii. Wzrost emisji może wynikać m.in. z:
- większego zużycia energii,
- zmiany paliw lub emisyjności energii elektrycznej,
- zmian w zakresie danych, metodzie obliczeń albo jakości danych,
- wzrostu liczby mieszkańców lub powierzchni ogrzewanej.

**Proponowany zapis do notatki:**

> Między inwentaryzacjami 2023 i 2024 całkowite emisje miasta wzrosły o 300 000 tCO₂e, tj. o 20%. Emisje w sektorze energii stacjonarnej wzrosły o 150 000 tCO₂e (20%) i pozostały największą kategorią emisji. Wynik ten wskazuje na wzrost raportowanych emisji związanych z energią, lecz sam w sobie nie pozwala przesądzić o wzroście zużycia energii przez mieszkańców. Do potwierdzenia przyczyn zmiany potrzebne są dane o zużyciu paliw i energii elektrycznej, liczbie odbiorców oraz zastosowanych wskaźnikach emisyjności.

Warto też zaznaczyć ograniczenie porównania: obie inwentaryzacje mają ten sam zakres **GPC Basic+** i współczynniki **AR6**, ale dane były wprowadzane ręcznie lub importowane, a sektory IPPU i AFOLU pozostają niewypełnione.

Czas do końca odpowiedzi (wraz z UI): 10.0 s.
