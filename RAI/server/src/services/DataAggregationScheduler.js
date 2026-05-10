/**
 * Data Aggregation Scheduler.
 *
 * Periodično zaganja agregirane podatke v ozadju:
 *   - vsake 5 minut: aggregate5min()
 *   - vsako uro: aggregate1hour()
 *   - vsak dan: aggregateDaily()
 *
 * Uporaba:
 *   const scheduler = new DataAggregationScheduler();
 *   await scheduler.start();
 *   // ... kasneje
 *   await scheduler.stop();
 */

const DataAggregationService = require('./DataAggregationService');

class DataAggregationScheduler {
  constructor() {
    this.isRunning = false;
    this.intervals = {
      '5min': null,
      '1hour': null,
      'daily': null,
    };
    this.stats = {
      '5min': { runs: 0, totalAggregated: 0 },
      '1hour': { runs: 0, totalAggregated: 0 },
      'daily': { runs: 0, totalAggregated: 0 },
    };
  }

  /**
   * Začni z agregiracijo
   */
  async start() {
    if (this.isRunning) {
      // eslint-disable-next-line no-console
      console.warn('[DataAggregationScheduler] Already running');
      return;
    }

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log('[DataAggregationScheduler] Starting...');

    // Agregacija vsake 5 minut
    this.intervals['5min'] = setInterval(async () => {
      try {
        const result = await DataAggregationService.aggregate5min();
        this.stats['5min'].runs += 1;
        this.stats['5min'].totalAggregated += result.aggregatedCount;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DataAggregationScheduler] Error in 5min aggregation:', err.message);
      }
    }, 5 * 60 * 1000); // 5 minut

    // Agregacija vsako uro
    this.intervals['1hour'] = setInterval(async () => {
      try {
        const result = await DataAggregationService.aggregate1hour();
        this.stats['1hour'].runs += 1;
        this.stats['1hour'].totalAggregated += result.aggregatedCount;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DataAggregationScheduler] Error in 1hour aggregation:', err.message);
      }
    }, 60 * 60 * 1000); // 1 ura

    // Agregacija vsak dan
    this.intervals['daily'] = setInterval(async () => {
      try {
        const result = await DataAggregationService.aggregateDaily();
        this.stats['daily'].runs += 1;
        this.stats['daily'].totalAggregated += result.aggregatedCount;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DataAggregationScheduler] Error in daily aggregation:', err.message);
      }
    }, 24 * 60 * 60 * 1000); // 1 dan

    // eslint-disable-next-line no-console
    console.log('[DataAggregationScheduler] Started successfully');
  }

  /**
   * Zaustavi agregiracijo
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    for (const [period, interval] of Object.entries(this.intervals)) {
      if (interval) {
        clearInterval(interval);
        this.intervals[period] = null;
      }
    }

    this.isRunning = false;
    // eslint-disable-next-line no-console
    console.log('[DataAggregationScheduler] Stopped');
  }

  /**
   * Ročno zagani agregacijo (za testiranje ali force-run)
   * @param {string} aggregationType - '5min', '1hour', 'daily'
   */
  async runNow(aggregationType) {
    if (!['5min', '1hour', 'daily'].includes(aggregationType)) {
      throw new Error(`Invalid aggregation type: ${aggregationType}`);
    }

    try {
      const result = await DataAggregationService.aggregate(aggregationType);
      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[DataAggregationScheduler] Error running ${aggregationType}:`, err.message);
      throw err;
    }
  }

  /**
   * Vrni status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      stats: this.stats,
    };
  }
}

module.exports = DataAggregationScheduler;
