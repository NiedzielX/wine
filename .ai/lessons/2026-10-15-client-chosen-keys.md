---
date: 2026-10-15
updated:
area: engine
status: active
source: .ai/runs/2026-10-15-engineering-standards.md
promoted: AGENTS.md §1.6
---

# Klucze wybierane przez klienta nie trafiają do zwykłego obiektu jako słownika

## Kontekst
Odpowiedź o błędzie walidacji budowała `fields[klucz] ??= kod`, gdzie `klucz` to nazwa nieznanego pola z żądania. Test z `{"constructor": …, "__proto__": …}` pokazał pusty wynik: `fields.constructor` już istnieje (odziedziczone), więc `??=` nic nie robi, a przypisanie do `__proto__` jest po cichu pomijane. Zgubione zostały dokładnie te klucze, które podrzuciłby atakujący. Ta sama pułapka siedziała w redakcji logów.

## Reguła
- Słownik, którego klucze pochodzą z żądania, logu lub pliku, budujemy `Map` albo `Object.fromEntries` (tworzy własne właściwości, także `__proto__`), a nie `obj[klucz] = …`.
- Sprawdzanie obecności klucza: `Map.has` albo `Object.hasOwn`, nie `obj[klucz] ?? …` ani `in`.
- Testy walidacji i logowania zawsze zawierają `constructor` i `__proto__`.

## Jak sprawdzić
`core/tests/validators.test.ts` („prototype pollution keys…”) i `core/tests/logging.test.ts` („__proto__”).
