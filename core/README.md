# AgroCloud Core

Project-level material that is not part of the running application: documentation, database schema, standalone tools and local launch scripts.

The application itself lives in `frontend/`, `backend/`, `services/` and `analysis_engine/`. Files at the repository root such as `index.html`, `assets/`, `sw.js`, icons and `CNAME` are the GitHub Pages deploy output written by CI and must stay at the root.

```text
core/
├─ docs/                 # repository & technical documentation
│  ├─ REPOSITORY.md
│  └─ DataSource_Advanced_Layer_Technical_Docs.md
├─ database/             # SQL schema / migrations (PostGIS)
│  └─ db_migration.sql
├─ tools/                # standalone utilities (open directly in a browser)
│  └─ agro-structures-data-entry.html
└─ scripts/
   └─ windows/           # Windows launchers (run from anywhere; they cd to the repo root)
      ├─ start_system.bat
      ├─ start_background.vbs
      └─ publish-to-github.ps1
```
