Copy js/ files (replace). Apply after kano-animals.zip. ModelManager.js here includes the earlier light-passenger ordering.
1. KAROTA officers now use your real police-man.glb (new catalog key karotaOfficer); the procedural officer stays as fallback.
2. KanoGlbPathResolver.js: requested GLB paths that don't exist are matched to existing files by normalised name.
FINDING: 29 model paths in the catalog point at files that are NOT in public/assets/models (keke-6/7/8, women_in_hijab,
lowpoly_bmw_e36_m3, electricity poles, traffic-light, road-sign-stop, light-curved...). Those need the actual files added.
The 22 "unused" files are duplicate copies (kebab-case vs snake_case) of models already in use, not extra models.
Tests 1443/1443 pass.
