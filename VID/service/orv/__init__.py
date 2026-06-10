"""ORV storitev — racunalniski vid za Smart Playgrounds (SCRUM-65..68).

FastAPI servis, ki:
  * gosti demo videe kot MJPEG "kamera" toke (nasa stream povezava),
  * hrani konfiguracijo kamere/kalibracije na igrisce (RAI court id),
  * (kasneje) detektira igralce, steje zasedenost in gradi heatmap gibanja.
"""

__version__ = "0.1.0"
