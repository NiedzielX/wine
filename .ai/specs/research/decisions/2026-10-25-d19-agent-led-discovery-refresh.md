# D19 — Odświeżenie discovery prowadzi agent: desk research i jawne założenia zamiast odpowiedzi właściciela

- Date, owner: 2026-10-25, Filip (product owner)
- Context and the options weighed: `om-discover --refresh` wstrzymano po pytaniach o kontakty do rozmów (Q01), próg sukcesu (Q02), eksport z POS (Q03) i kryteria zatrzymania. Alternatywa: czekać na odpowiedzi właściciela, który nie ma dziś dostępu do restauracji z segmentu.
- Decision and why: właściciel: „zrób to samemu robiąc desk research i dokonując założeń”. Agent zbiera dostępne źródła (tropy w `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md`) i przedstawia pozostałe odpowiedzi jako założenia lub propozycje. Co agent proponuje (D20, D21, kryteria zatrzymania), ma status `proposal`, dopóki Filip ich nie potwierdzi; czego nie da się ustalić bez ludzi (kontakty, baseline z POS, zgoda restauracji), zostaje na Collection plan.
- Consequences, and what would make us revisit it: żadna propozycja nie jest dowodem ani decyzją właściciela. Pierwsza rozmowa z C01 lub dane z C03 mogą zmienić założenia. Brak informacji o kontaktach (Q01) pozostaje blokadą rozmów C01 i C05.
- Status: active
