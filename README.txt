Copy js/KanoFlyoverRoundaboutUpgrade.js into your project (replace). Apply after kano-activation.zip.
Flyovers no longer loop on every road. They are built into the scene only on routes that have one in real Kano:
  Kofar Mata  -> "KOFAR MATA FLYOVER"
  Kofar Dan Agundi -> "DAN AGUNDI INTERCHANGE"
The signboard text changes with the route. To add another real site, add a line to KANO_FLYOVER_SITES.
(Tal'udu interchange is real too but has no matching route in config.js yet.)
Tests 1443/1443 pass.
