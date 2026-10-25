// Rolevia AI · Base ATS Adapter Interface
// Abstract foundation for modular ATS automation handlers.

class BaseAtsAdapter {
  constructor(name, engineId) {
    this.name = name;
    this.engineId = engineId;
  }

  /**
   * Evaluates if a given URL or page content belongs to this ATS engine.
   * @param {string} url
   * @param {string} [content]
   * @returns {boolean}
   */
  matches(url, content = '') {
    throw new Error('matches() must be implemented by subclass');
  }

  /**
   * Identifies form fields, labels, inputs, and submit triggers on the page.
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async inspectForm(page) {
    throw new Error('inspectForm() must be implemented by subclass');
  }

  /**
   * Populates standard candidate personal and contact details.
   * @param {import('playwright').Page} page
   * @param {Object} candidateData
   * @returns {Promise<Object>} Population result and field mapping audit
   */
  async populateFields(page, candidateData) {
    throw new Error('populateFields() must be implemented by subclass');
  }

  /**
   * Uploads the candidate's approved resume PDF to the file input.
   * @param {import('playwright').Page} page
   * @param {Buffer} pdfBuffer
   * @param {string} filename
   * @returns {Promise<{ uploaded: boolean, inputName: string }>}
   */
  async uploadResume(page, pdfBuffer, filename) {
    throw new Error('uploadResume() must be implemented by subclass');
  }

  /**
   * Answers custom employer screening questions using verified candidate facts.
   * @param {import('playwright').Page} page
   * @param {Object} candidateData
   * @returns {Promise<{ answered: number, unhandled: Array<Object> }>}
   */
  async answerScreeningQuestions(page, candidateData) {
    throw new Error('answerScreeningQuestions() must be implemented by subclass');
  }

  /**
   * Validates form completion before submission.
   * @param {import('playwright').Page} page
   * @returns {Promise<{ valid: boolean, missingRequired: Array<string> }>}
   */
  async validateForm(page) {
    throw new Error('validateForm() must be implemented by subclass');
  }

  /**
   * Executes the final submission trigger on the employer portal.
   * @param {import('playwright').Page} page
   * @returns {Promise<{ submitted: boolean, status: string }>}
   */
  async submit(page) {
    throw new Error('submit() must be implemented by subclass');
  }

  /**
   * Parses official submission receipt, confirmation number, and portal response.
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async parseReceipt(page) {
    throw new Error('parseReceipt() must be implemented by subclass');
  }
}

module.exports = BaseAtsAdapter;
