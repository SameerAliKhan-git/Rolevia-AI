// Rolevia AI · ATS Adapter Registry & Selector
// Automatically matches employer application URLs and DOM indicators to the appropriate ATS engine adapter.

const GreenhouseAdapter = require('./adapters/greenhouseAdapter');
const AshbyAdapter = require('./adapters/ashbyAdapter');
const LeverAdapter = require('./adapters/leverAdapter');
const WorkdayAdapter = require('./adapters/workdayAdapter');

class AtsAdapterRegistry {
  constructor() {
    this.adapters = [
      new GreenhouseAdapter(),
      new AshbyAdapter(),
      new LeverAdapter(),
      new WorkdayAdapter()
    ];
  }

  /**
   * Resolves the matching ATS adapter for a given URL or page content.
   * @param {string} url
   * @param {string} [pageContent='']
   * @returns {import('./adapters/baseAdapter')}
   */
  resolveAdapter(url, pageContent = '') {
    if (!url) {
      throw new Error('INVALID_URL: Target application URL must be provided');
    }

    for (const adapter of this.adapters) {
      if (adapter.matches(url, pageContent)) {
        return adapter;
      }
    }

    throw new Error(`UNSUPPORTED_ATS: No adapter found for URL "${url}". Supported platforms: Greenhouse, Ashby, Lever, Workday.`);
  }

  listSupportedEngines() {
    return this.adapters.map(a => ({ id: a.engineId, name: a.name }));
  }
}

module.exports = new AtsAdapterRegistry();
