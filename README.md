# Hospital Architect soak progress

How Hospital Architect's simulated reference hospital fares from version to version, published at
https://chrisraynersg.github.io/hospital-architect-soaks/.

Hospital Architect is a hospital management game with a simulated body for every patient. A balance soak runs a fixed
reference hospital headless for a set number of game days on fixed random seeds, so each version of the game can be
compared with the last on the same days of patients. This site shows:

- **Progress:** every hospital figure (arrivals, deaths, waits, satisfaction, money and more) version by version, one
  line per seed and their mean.
- **Version by version:** each version against the one before it, seed by seed, with every value that moved by more
  than the larger of 15% and a floor for its kind.
- **Runs:** single runs day by day.

The figures are simulation results from development builds, not real hospital data.

This repository holds only the built site. It is written by `Tools/Workbench/soak_site.py` in the game's (private)
repository, which copies an allowlist of each run's settings and its figures, never machine names, file paths or error
text, and checks the export for anything private before it is pushed.
