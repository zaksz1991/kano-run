Copy js/ and tests/ files into your project (replace).
REAL JUNCTION TURNS (js/KanoRoadNavigationUpgrade.js)
Before: the world rotated but the camera cancelled it exactly, so a left/right turn changed nothing on screen.
Now:
- a real cross road (asphalt, dashes, kerbs, stop line) is placed at each junction ahead
- when you tap LEFT/RIGHT/U-TURN (below 35 km/h) the keke body yaws into the turn, the scenery swings past,
  and a short fade hides the hand-over to the new road
Tests 1443/1443 pass. Traffic cars are part of the world, so they swing with it; independent AI cars turning
at junctions is the next step.
