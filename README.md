## Youth Squad Planner

Internal, password-protected tool for planning next season's youth team rosters.

- Roster data: run `node fetchPlayers.js` manually whenever the scraped list needs
  refreshing (or trigger the "Update Youth Players Roster" GitHub Action from the
  Actions tab). This is **not** automatic.
- The app itself lives in `squad-planner/` and is *not* linked from the public
  site — access it directly via its GitHub Pages URL, shared only with the club
  manager. It requires a shared password (see whoever set up the Firebase project
  for the credential).
- One-time setup (Firebase project, Auth account, Firestore rules) is documented
  in `docs/superpowers/plans/2026-07-04-youth-squad-planner.md`, Task 1.
