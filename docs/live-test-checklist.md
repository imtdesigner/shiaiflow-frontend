# ShiaiFlow — alfa test na daljinu (subota, 28.11.2026.)

**Tko što radi**
- **Ivan (organizator):** postavlja turnir, prati Manage i oba Court screena (monitor), radi ispravke i test bez interneta.
- **Tester 1 i tester 2 (od kuće):** svaki je zapisnički stol jednog shiaijoa, oba rade istovremeno.
- Dogovor i javljanje problema: Viber grupa „ShiaiFlow Alpha“.

**Turnir:** 3 kategorije: 2 pojedinačne (jedna s poolovima + KO, jedna mala / direktni KO) i 1 timska (3 člana), na 2 shiaijoa.

**Kad javljaš problem**, napiši: ✓ radi / ✗ zapelo (što, kada, na kojem uređaju) / ? nejasno, i **verziju** iz donjeg lijevog kuta ekrana (npr. `v0.2.0 · 2026.11.25 · e066729`). Screenshot dobro dođe.

---

## 0. Što tester dobiva (Ivan šalje na Viber)
- [ ] Link za ulaz: `https://app.shiaiflow.com/join/<id turnira>` (Manage → kartica PIN prikazuje točan link).
- [ ] PIN turnira (4 znamenke).
- [ ] Broj svog shiaijoa (Tester 1 → Shiaijo 1, Tester 2 → Shiaijo 2).
- [ ] Preporuka: laptop ili tablet, Chrome / Safari, **odjavljen** iz ShiaiFlowa (ili privatni prozor).

## 1. Prije testa (Ivan, dan ranije ili ujutro)
- [ ] Otvoriti aplikaciju (Supabase je budan; to radi i automatski ping svaka 2 dana).
- [ ] Novi turnir kroz wizard: Create → Signup setup → Shiaijo plan → Done.
- [ ] 3 kategorije iz predložaka (npr. Kyu, Dan, Team adults); timska kategorija stvarno ostane **Team**.
- [ ] Edit tournament → status lijevo: Published → Signup open.
- [ ] Javna prijava s mobitela (2–3 natjecatelja), uključujući tim.
- [ ] Bulk entry u Registration (copy iz Excela): spol, godište, pojas se upišu ispravno.
- [ ] Signup → Closed. Ždrijeb svih kategorija u Drawings (provjeri razdvajanje klubova).
- [ ] Draws na javnoj stranici: Hidden → Published.
- [ ] Confirm draws. Shiaijo plan: 2 shiaijoa. Fight plan → Print, Paper backup → Print (probno).
- [ ] PIN kreiran (Edit → Tournament basics) i poslan testerima s linkom.

## 2. Ulaz stolova i start
- [ ] Check-in u Registration (Present). Jedan natjecatelj „ne dođe“ → Drawings → Adjust: zamjena / withdraw.
- [ ] Jedan „walk-in“ dodan i ubačen u kratki pool.
- [ ] Start tournament (Manage): tablica spremnosti je točna.
- [ ] **Testeri:** link + PIN kroz vrata **Table** → za svaki shiaijo dva gumba: **Scorekeeping manager** i **Court screen (monitor)**. Tester odabere svoj shiaijo.
- [ ] Tester vidi samo svoj stol i izbor shiaijoa, bez dashboarda, Create, Profile.
- [ ] Tester otvori i svoj Court screen u drugom prozoru (glumi TV) → borba se pojavi u roku od ~1 s nakon klika.
- [ ] **Ivan:** oba Court screena (Manage → Court screens) jedan uz drugi; Sides ⇄ radi; ekran se ne gasi, pointer se sakrije.

## 3. Bodovanje (testeri)
- [ ] Hajime / Yame: sat na stolu krene i stane (Court screen namjerno nema sat).
- [ ] **Potvrda boda:** klik K → „Kote (K) for …?“; sat i dalje teče. Confirm upiše bod i zaustavi sat, Cancel ne upiše ništa.
- [ ] Hansoku (jedan klik); drugi hansoku → automatski ippon protivniku.
- [ ] Undo last.
- [ ] Dva ippona završe borbu; Finish → na ekranu se pojavi „next fight“.
- [ ] Hikiwake u poolu; encho u KO (E na ekranu, prvi bod pobjeđuje); hantei (HH) ako je postavljen.
- [ ] Fusen-gachi (OO) za natjecatelja koji ne izađe.
- [ ] Borba niže u redu (Take next) → preskočene se pomaknu ispod.
- [ ] Gumb poola na stolu → poredak poola u prozorčiću.
- [ ] Fighting spirit: nakon zadnje borbe kategorije na shiaijou stol predloži borca (Confirm / Skip / Later).

## 4. Bez interneta (Ivan ili jedan tester)
- [ ] Usred borbe **ugasiti Wi-Fi** → oznaka „● Offline — N clicks waiting“.
- [ ] Upisati 1–2 boda i Yame offline → stol prikazuje rezultat.
- [ ] **Osvježiti stranicu dok je offline** → rezultat je i dalje tu.
- [ ] Pokušati Finish offline → jasna poruka, ništa se ne izgubi.
- [ ] **Upaliti Wi-Fi** → „Saving…“ → „● Online“. Court screen i Manage pokažu iste bodove, bez duplih bodova.
- [ ] Za to vrijeme drugi stol radi normalno.

## 5. Poolovi i KO
- [ ] Poredak u poolu nakon zadnje borbe (Manage → Pool standings, gumb na stolu, javni Draw tab).
- [ ] Namjerno izjednačenje za mjesto koje prolazi → ipponshobu F-Pn.D se pojavi na istom shiaijou.
- [ ] Pobjednici poolova uđu u KO; KO borba krene čim su oba borca poznata.
- [ ] Borba za 3. mjesto (ako je uključena) prije finala.

## 6. Ispravke managera (Ivan, u Manageu)
- [ ] **Correct** na borbi u poolu → borba se ponovno otvori na stolu, tester je ponovno boduje → poredak i KO se promijene **bez osvježavanja** Managea.
- [ ] **Edit result** (pool ili KO, ne timski): promijeni bodove bez stola → poredak / KO prate.
- [ ] **Change order…** u poolu (strelice, razlog, pregled „What changes“) → oznaka „manual“; **Back to computed** vraća izračunati poredak.
- [ ] Ispravak nakon što je KO borba već odigrana → crvena kartica „KO fights to check“: probati **Fight again** (borba ide prva na svom shiaijou, tester je vidi kao sljedeću) i **Keep as fought**.
- [ ] KO brackets → **Change fighters…** za borbu koja nije počela; **Back to the bracket**.
- [ ] Kartica **Corrections**: svaka ispravka je zapisana.

## 7. Timski meč (tester na timskom shiaijou)
- [ ] Lineup korak: oba redoslijeda (prijedlog iz registracije / prošlog meča), „both handed in“ → Confirm.
- [ ] Prazna pozicija (gdje je dopušteno) → fusen za drugi tim.
- [ ] Pozicije jedna za drugom, sat se resetira po poziciji; hikiwake pozicije.
- [ ] Izjednačen meč → daihyosen (odabir borca po timu, prvi bod).
- [ ] Court screen: tim protiv tima, redovi po pozicijama, trenutna pozicija označena (provjeriti i na pravom TV-u ako je moguće).
- [ ] Finish team match; poredak timova u poolu.
- [ ] Ivan: Correct na timskom meču → „Correct: reopen <position>“ na stolu.

## 8. Javna strana (mobitel)
- [ ] Live tab: shiaijoi jedan uz drugi, prethodna / trenutna / sljedeće 3 borbe.
- [ ] Kategorija koja se bori otvori se sama; poredak poolova, zatim KO bracket s rezultatima.
- [ ] „Who are you“ → moja sljedeća borba.

## 9. Kraj
- [ ] Sve borbe gotove → status Finished.
- [ ] Results: mjesta po kategoriji, Fighting spirit (jedan prijedlog se uzme, kod dva se bira), Print.
- [ ] Ivan odobri verziju → **0.3.0**. Testni turnir se briše tek kad Ivan kaže.

---

**Bilješke s testa** (što je zapelo, kome je što bilo nejasno, ideje):

-
