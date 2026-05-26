/**
 * Scraper router — mountan na `/api/scraper`.
 *
 *   POST /run           — sproži scrape igrišč
 *   GET  /playgrounds   — vrne shranjena igrišča (javno, brez avtentikacije)
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  runScraper,
  listPlaygrounds,
} = require("../controllers/scraper.controller");

const router = express.Router();

router.post("/run", requireAuth, runScraper);
router.get("/playgrounds", listPlaygrounds);

module.exports = router;
