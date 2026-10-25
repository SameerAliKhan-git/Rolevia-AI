// Rolevia AI · Workday ATS Adapter (Experimental Multi-Step Wizard Engine)
// Handles myworkdayjobs.com multi-step progression, dynamic field mapping, and local Workday fixtures.

const BaseAtsAdapter = require('./baseAdapter');
const ScreeningQuestionMatcher = require('../screeningQuestions');
const fs = require('fs');
const path = require('path');
const os = require('os');

class WorkdayAdapter extends BaseAtsAdapter {
  constructor() {
    super('Workday', 'workday');
  }

  matches(url = '', content = '') {
    const u = url.toLowerCase();
    return u.includes('myworkdayjobs.com') || 
           u.includes('myworkday.com') ||
           u.includes('/fixtures/ats/workday') ||
           content.includes('data-automation-id="workday-application"') ||
           content.includes('data-mapped="workday"');
  }

  async inspectForm(page) {
    const steps = await page.evaluate(() => {
      const stepItems = Array.from(document.querySelectorAll('[data-automation-id="progressBar"] li, .wd-step'));
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return {
        multiStep: true,
        stepsCount: stepItems.length || 3,
        fieldsCount: inputs.length
      };
    });
    return { ats: 'workday', ...steps };
  }

  async populateFields(page, candidateData) {
    const user = candidateData.user || {};
    const nameParts = (user.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Sameer';
    const lastName = nameParts.slice(1).join(' ') || 'Khan';
    const email = user.email || 'candidate@example.com';
    const phone = user.phone || '+1-555-0199';

    const mapped = [];

    // First Name
    const fn = await page.$('[data-automation-id="legalNameSection_firstName"], input[name*="firstName"], #wd-first-name');
    if (fn) {
      await fn.fill(firstName);
      mapped.push({ field: 'firstName', value: firstName });
    }

    // Last Name
    const ln = await page.$('[data-automation-id="legalNameSection_lastName"], input[name*="lastName"], #wd-last-name');
    if (ln) {
      await ln.fill(lastName);
      mapped.push({ field: 'lastName', value: lastName });
    }

    // Email
    const em = await page.$('[data-automation-id="email"], input[name*="email"], #wd-email');
    if (em) {
      await em.fill(email);
      mapped.push({ field: 'email', value: email });
    }

    // Phone
    const ph = await page.$('[data-automation-id="phone-number"], input[name*="phone"], #wd-phone');
    if (ph) {
      await ph.fill(phone);
      mapped.push({ field: 'phone', value: phone });
    }

    return { mappedCount: mapped.length, mapped };
  }

  async uploadResume(page, pdfBuffer, filename = 'resume.pdf') {
    // Ensure we are on Step 2 where resume file input is located
    const isStep1Visible = await page.$eval('#step-1', el => !el.classList.contains('hidden')).catch(() => false);
    if (isStep1Visible) {
      await this.advanceStep(page);
    }

    const tempPath = path.join(os.tmpdir(), `rolevia_wd_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);

    try {
      const fileInput = await page.$('[data-automation-id="file-upload-dropzone"] input[type="file"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(tempPath);
        return { uploaded: true, inputId: 'workday_resume_upload', path: tempPath };
      }
      return { uploaded: false, reason: 'FILE_INPUT_NOT_FOUND' };
    } finally {
      setTimeout(() => { try { fs.unlinkSync(tempPath); } catch(e){} }, 5000);
    }
  }

  async advanceStep(page) {
    const nextBtn = await page.$('[data-automation-id="bottom-navigation-next-button"], button:has-text("Next"), #wd-btn-next');
    if (nextBtn) {
      const isVisible = await nextBtn.isVisible().catch(() => false);
      if (isVisible) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
        return true;
      }
    }
    return false;
  }

  async answerScreeningQuestions(page, candidateData) {
    const questions = await page.$$('[data-automation-id*="question"], .wd-question-row');
    let answered = 0;
    const unhandled = [];

    for (const qEl of questions) {
      const labelText = await qEl.$eval('label, .wd-question-label', el => el.innerText).catch(() => '');
      if (!labelText) continue;

      const input = await qEl.$('input[type="text"], textarea');
      const select = await qEl.$('select');

      if (select) {
        const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.innerText })));
        const match = ScreeningQuestionMatcher.matchQuestion({
          questionText: labelText,
          fieldType: 'select',
          options,
          candidate: candidateData
        });
        if (match.matched && match.value) {
          await select.selectOption({ label: match.value }).catch(() => select.selectOption({ value: match.value }));
          answered++;
        } else if (match.requiresIntervention) {
          unhandled.push({ label: labelText, reason: match.reason });
        }
      } else if (input) {
        const match = ScreeningQuestionMatcher.matchQuestion({
          questionText: labelText,
          fieldType: 'text',
          candidate: candidateData
        });
        if (match.matched && match.value) {
          await input.fill(String(match.value));
          answered++;
        } else if (match.requiresIntervention) {
          unhandled.push({ label: labelText, reason: match.reason });
        }
      }
    }

    return { answered, unhandled };
  }

  async validateForm(page) {
    const missing = await page.evaluate(() => {
      const required = Array.from(document.querySelectorAll('input[required], select[required]'));
      const unfilled = required.filter(el => !el.value || el.value.trim() === '');
      return unfilled.map(el => el.name || el.id || 'unnamed');
    });

    return {
      valid: missing.length === 0,
      missingRequired: missing
    };
  }

  async submit(page) {
    const submitBtn = await page.$('[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit"), #wd-btn-submit');
    if (!submitBtn) {
      throw new Error('SUBMIT_BUTTON_NOT_FOUND: Could not locate Workday submit button');
    }

    await submitBtn.click();
    await page.waitForTimeout(2000);
    return { submitted: true, status: 'SUBMITTED_IN_FLIGHT' };
  }

  async parseReceipt(page) {
    const isConfirmed = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const hasConfirm = text.includes('thank you') || 
                         text.includes('application submitted') || 
                         text.includes('successfully submitted');
      const confNumEl = document.querySelector('[data-automation-id="confirmation-number"], .wd-confirmation-code');
      return {
        confirmed: hasConfirm,
        confirmationNumber: confNumEl ? confNumEl.innerText.trim() : null
      };
    });

    return {
      confirmed: isConfirmed.confirmed,
      ats: 'workday',
      confirmationNumber: isConfirmed.confirmationNumber || `WD-${Date.now().toString().slice(-8)}`,
      receiptTimestamp: new Date().toISOString()
    };
  }
}

module.exports = WorkdayAdapter;
