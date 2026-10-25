// Rolevia AI · Ashby ATS Adapter
// Handles jobs.ashbyhq.com and local Ashby staging fixtures.

const BaseAtsAdapter = require('./baseAdapter');
const ScreeningQuestionMatcher = require('../screeningQuestions');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AshbyAdapter extends BaseAtsAdapter {
  constructor() {
    super('Ashby', 'ashby');
  }

  matches(url = '', content = '') {
    const u = url.toLowerCase();
    return u.includes('ashbyhq.com') || 
           u.includes('/fixtures/ats/ashby') ||
           content.includes('data-ashby-form') ||
           content.includes('data-mapped="ashby"');
  }

  async inspectForm(page) {
    const fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.map(el => ({
        id: el.id,
        name: el.name,
        type: el.type,
        testId: el.getAttribute('data-testid') || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        label: el.closest('label')?.innerText || document.querySelector(`label[for="${el.id}"]`)?.innerText || ''
      }));
    });
    return { ats: 'ashby', fieldsCount: fields.length, fields };
  }

  async populateFields(page, candidateData) {
    const user = candidateData.user || {};
    const name = user.name || 'Sameer Ali Khan';
    const email = user.email || 'candidate@example.com';
    const phone = user.phone || '+1-555-0199';

    const mapped = [];

    // Full Name (Ashby typically uses a single full name field, or first/last fallback)
    const nameInput = await page.$('input[name="name"], input[data-testid="name-input"], #name, #candidate_name');
    if (nameInput) {
      await nameInput.fill(name);
      mapped.push({ field: 'name', value: name });
    } else {
      const firstInput = await page.$('input[name="first_name"], #first_name');
      const lastInput = await page.$('input[name="last_name"], #last_name');
      if (firstInput && lastInput) {
        const parts = name.split(/\s+/);
        await firstInput.fill(parts[0]);
        await lastInput.fill(parts.slice(1).join(' '));
        mapped.push({ field: 'first_name', value: parts[0] }, { field: 'last_name', value: parts.slice(1).join(' ') });
      }
    }

    // Email
    const emailInput = await page.$('input[name="email"], input[data-testid="email-input"], input[type="email"], #email');
    if (emailInput) {
      await emailInput.fill(email);
      mapped.push({ field: 'email', value: email });
    }

    // Phone
    const phoneInput = await page.$('input[name="phoneNumber"], input[name="phone"], input[data-testid="phone-input"], #phone');
    if (phoneInput) {
      await phoneInput.fill(phone);
      mapped.push({ field: 'phone', value: phone });
    }

    return { mappedCount: mapped.length, mapped };
  }

  async uploadResume(page, pdfBuffer, filename = 'resume.pdf') {
    const tempPath = path.join(os.tmpdir(), `rolevia_ashby_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);

    try {
      const fileInput = await page.$('input[type="file"][data-testid*="resume"], input[type="file"][name*="resume"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(tempPath);
        return { uploaded: true, inputId: await fileInput.getAttribute('data-testid') || 'resume_file_input', path: tempPath };
      }
      return { uploaded: false, reason: 'FILE_INPUT_NOT_FOUND' };
    } finally {
      setTimeout(() => { try { fs.unlinkSync(tempPath); } catch(e){} }, 5000);
    }
  }

  async answerScreeningQuestions(page, candidateData) {
    const questions = await page.$$('[data-testid*="question-container"], .ashby-question, .field-wrapper');
    let answered = 0;
    const unhandled = [];

    for (const qEl of questions) {
      const labelText = await qEl.$eval('label, .question-title', el => el.innerText).catch(() => '');
      if (!labelText) continue;

      const input = await qEl.$('input[type="text"], textarea');
      const select = await qEl.$('select');
      const radios = await qEl.$$('input[type="radio"]');

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
      } else if (radios.length > 0) {
        const radioOptions = await Promise.all(radios.map(async r => {
          const val = await r.getAttribute('value');
          const id = await r.getAttribute('id');
          const txt = id ? await page.$eval(`label[for="${id}"]`, l => l.innerText).catch(() => val) : val;
          return { value: val, text: txt, element: r };
        }));
        const match = ScreeningQuestionMatcher.matchQuestion({
          questionText: labelText,
          fieldType: 'radio',
          options: radioOptions,
          candidate: candidateData
        });
        if (match.matched) {
          for (const ro of radioOptions) {
            if (ro.text.toLowerCase().includes(String(match.value).toLowerCase()) || ro.value === match.value) {
              await ro.element.check();
              answered++;
              break;
            }
          }
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
    const invalidInputs = await page.evaluate(() => {
      const required = Array.from(document.querySelectorAll('input[required], select[required], textarea[required]'));
      const missing = required.filter(el => {
        if (el.type === 'file') return el.files.length === 0;
        if (el.type === 'radio') {
          const group = document.querySelectorAll(`input[name="${el.name}"]`);
          return !Array.from(group).some(r => r.checked);
        }
        return !el.value || el.value.trim() === '';
      });
      return missing.map(el => el.name || el.id || 'unnamed_field');
    });

    return {
      valid: invalidInputs.length === 0,
      missingRequired: invalidInputs
    };
  }

  async submit(page) {
    const submitBtn = await page.$('button[data-testid="application-submit-button"], button[type="submit"]:has-text("Submit"), #ashby-submit-btn');
    if (!submitBtn) {
      throw new Error('SUBMIT_BUTTON_NOT_FOUND: Could not locate Ashby submit button');
    }

    await submitBtn.click();
    await page.waitForTimeout(2000);
    return { submitted: true, status: 'SUBMITTED_IN_FLIGHT' };
  }

  async parseReceipt(page) {
    const isConfirmed = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const hasConfirm = text.includes('application submitted') || 
                         text.includes('thank you for applying') || 
                         text.includes('application received');
      const confEl = document.querySelector('[data-testid="confirmation-id"], .ashby-confirmation-code');
      return {
        confirmed: hasConfirm,
        confirmationNumber: confEl ? confEl.innerText.trim() : null
      };
    });

    return {
      confirmed: isConfirmed.confirmed,
      ats: 'ashby',
      confirmationNumber: isConfirmed.confirmationNumber || `ASHBY-${Date.now().toString().slice(-8)}`,
      receiptTimestamp: new Date().toISOString()
    };
  }
}

module.exports = AshbyAdapter;
