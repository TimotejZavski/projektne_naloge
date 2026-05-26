/**
 * Smoke test za PlaygroundScraper.
 *
 * Preveri:
 *   1. Parsanje HTML-ja iz testnih podatkov (brez omrežja)
 *   2. Realni scrape vseh 5 strani + geokodiranje
 *
 * Uporaba: node scripts/smoke-scraper.js
 */

const {
  scrapePlaygrounds,
  extractPlaygrounds,
} = require("../src/scraper/PlaygroundScraper");

const SAMPLE_HTML = `
<div class="pins_table_wrap_parent">
  <div class="table_wrap">
    <table>
      <tr><th>Ime igrišča</th><th>Naslov</th><th>Povezava</th></tr>
      <tr>
        <td>Igrišče Mestni park</td>
        <td>Igrala V Mestnem Parku MB, Maribor</td>
        <td></td>
      </tr>
      <tr>
        <td>Igrišče Slovenska ulica</td>
        <td>Otroško igrišče Slovenska ulica, Center, Maribor</td>
        <td></td>
      </tr>
    </table>
  </div>
</div>`;

async function main() {
  let ok = 0;
  let fail = 0;

  // Test 1: HTML parsing (brez omrežja)
  console.log("[1/2] Test: HTML ekstrakcija");
  const extracted = extractPlaygrounds(SAMPLE_HTML);
  if (extracted.length !== 2) {
    console.error(`  FAIL: pričakovana 2 igrišči, dobil ${extracted.length}`);
    fail++;
  } else if (extracted[0].name !== "Igrišče Mestni park") {
    console.error(`  FAIL: napačno ime: "${extracted[0].name}"`);
    fail++;
  } else {
    console.log("  OK: 2 igrišči pravilno ekstrahirani");
    console.log(`    - "${extracted[0].name}"`);
    console.log(`    - "${extracted[1].name}"`);
    ok++;
  }

  // Test 2: Realni scrape + geokodiranje
  console.log("\n[2/2] Test: Realni scrape maribor.si + geokodiranje");
  console.log("  (lahko traja ~30-60s zaradi Nominatim rate-limit-a)");
  try {
    const result = await scrapePlaygrounds();
    console.log(`  Scrape-anih: ${result.playgrounds.length} igrišč`);
    console.log(
      `  Geokodiranih: ${result.withLocation.length}/${result.playgrounds.length}`,
    );

    if (result.errors.length > 0) {
      console.log(`  Opozoril: ${result.errors.length}`);
      result.errors
        .slice(0, 3)
        .forEach((e) => console.log(`    - ${JSON.stringify(e)}`));
    }

    if (result.playgrounds.length < 30) {
      console.error(
        `  FAIL: pričakujem vsaj 30 igrišč, dobil ${result.playgrounds.length}`,
      );
      fail++;
    } else if (result.withLocation.length === 0) {
      console.error("  FAIL: nobeno igrišče ni bilo geokodirano");
      fail++;
    } else {
      console.log(
        `  OK: ${result.playgrounds.length} igrišč, ${result.withLocation.length} z lokacijo`,
      );
      ok++;
    }

    // Izpiši prvih 5
    console.log("\n  Prvih 5 igrišč:");
    result.playgrounds.slice(0, 5).forEach((p) => {
      const loc = p.location
        ? ` (${p.location.latitude}, ${p.location.longitude})`
        : " (BREZ LOKACIJE)";
      console.log(`    - ${p.name}${loc}`);
    });

    // Izpiši tiste brez lokacije
    const without = result.playgrounds.filter((p) => !p.location);
    if (without.length > 0) {
      console.log(`\n  ⚠ Brez lokacije (${without.length}):`);
      without.forEach((p) => console.log(`    - ${p.name}`));
      console.log(
        "  → Ročno dodaj koordinate v MANUAL_GEOCODE v PlaygroundScraper.js",
      );
    }
  } catch (err) {
    console.error(`  FAIL: ${err.message}`);
    fail++;
  }

  console.log(`\n=== REZULTAT: ${ok}/${ok + fail} testov uspešnih ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Smoke test padel:", err);
  process.exit(1);
});
