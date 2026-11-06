# AgroCloud Core

Project material that is not part of the running application: documentation, database SQL, standalone tools and Windows launchers. The application lives in `frontend/`, `backend/`, `services/` and `analysis_engine/`; the full repository tree is in [ARCHITECTURE.md](../ARCHITECTURE.md).

```text
core/
├─ docs/
│  ├─ DEPLOYMENT.md              hosting, GitHub Pages (/docs), VPS, Railway
│  ├─ AUTHENTICATION.md          sign-in, sessions, identity setup
│  ├─ CREDITS.md                 credits / quotas
│  ├─ REPOSITORY.md              requirements, commands, conventions
│  ├─ DataSource_Advanced_Layer_Technical_Docs.md
│  └─ examples/                  Earth Engine script, segmentation training notebook
├─ database/
│  └─ db_migration.sql           PostGIS schema
├─ tools/
│  ├─ agro-structures-data-entry.html   open directly in a browser
│  ├─ compare_field_reports.py   python core/tools/compare_field_reports.py <current.xlsx> <reference.xlsx>
│  └─ extract_ref_styles.py      python core/tools/extract_ref_styles.py <reference.xlsx>
└─ scripts/windows/              launchers (run from anywhere; they cd to the repo root)
   ├─ start_system.bat
   ├─ start_background.vbs
   └─ publish-to-github.ps1
```
