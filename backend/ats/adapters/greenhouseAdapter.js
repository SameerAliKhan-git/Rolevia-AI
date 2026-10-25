// Rolevia AI · Greenhouse ATS Adapter
// Handles boards.greenhouse.io, job-boards.greenhouse.io, embed iframes, and local fixtures.

const BaseAtsAdapter = require('./baseAdapter');
const ScreeningQuestionMatcher = require('../screeningQuestions');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GreenhouseAdapter extends BaseAtsAdapter {
  constructor() {
    super('Greenhouse', 'greenhouse');
  }

  matches(url = '', content = '') {
    const u = url.toLowerCase();
    return u.includes('greenhouse.io') || 
           u.includes('gh_src') || 
           u.includes('/fixtures/ats/greenhouse') ||
           content.includes('id="application_form"') ||
           content.includes('data-mapped="greenhouse"');
  }

  async inspectForm(page) {
    const fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.map(el => ({
        id: el.id,
        name: el.name,
        type: el.type,
        required: el.required || el.getAttribute('aria-required') === 'true',
        label: el.closest('label')?.innerText || document.querySelector(`label[for="${el.id}"]`)?.innerText || ''
      }));
    });
    return { ats: 'greenhouse', fieldsCount: fields.length, fields };
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
    const firstNameInput = await page.$('#first_name, input[name="first_name"], input[name="job_application[first_name]"]');
    if (firstNameInput) {
      await firstNameInput.fill(firstName);
      mapped.push({ field: 'first_name', value: firstName });
    }

    // Last Name
    const lastNameInput = await page.$('#last_name, input[name="last_name"], input[name="job_application[last_name]"]');
    if (lastNameInput) {
      await lastNameInput.fill(lastName);
      mapped.push({ field: 'last_name', value: lastName });
    }

    // Email
    const emailInput = await page.$('#email, input[name="email"], input[name="job_application[email]"]');
    if (emailInput) {
      await emailInput.fill(email);
      mapped.push({ field: 'email', value: email });
    }

    // Phone
    const phoneInput = await page.$('#phone, input[name="phone"], input[name="job_application[phone]"]');
    if (phoneInput) {
      await phoneInput.fill(phone);
      mapped.push({ field: 'phone', value: phone });
    }

    // Location / City
    const locationInput = await page.$('#job_application_location, input[name*="location"]');
    if (locationInput && user.location) {
      await locationInput.fill(user.location);
      mapped.push({ field: 'location', value: user.location });
    }

    return { mappedCount: mapped.length, mapped };
  }

  async uploadResume(page, pdfBuffer, filename = 'resume.pdf') {
    // Write buffer to temporary file for Playwright fileChooser / setInputFiles
    const tempPath = path.join(os.tmpdir(), `rolevia_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);

    try {
      const fileInput = await page.$('input[type="file"][id*="resume"], input[name*="resume"], input[data-field="resume"]');
      if (fileInput) {
        await fileInput.setInputFiles(tempPath);
        return { uploaded: true, inputId: await fileInput.getAttribute('id') || 'resume_input', path: tempPath };
      }
      return { uploaded: false, reason: 'FILE_INPUT_NOT_FOUND' };
    } finally {
      // Clean up after 1s
      setTimeout(() => { try { fs.unlinkSync(tempPath); } catch(e){} }, 5000);
    }
  }

  async answerScreeningQuestions(page, candidateData) {
    const questions = await page.$$('.custom-question, .field:has(label), .application-question');
    let answered = 0;
    const unhandled = [];

    for (const qEl of questions) {
      const labelText = await qEl.$eval('label', el => el.innerText).catch(() => '');
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
        const radioLabels = await Promise.all(radios.map(async r => {
          const id = await r.getAttribute('id');
          const val = await r.getAttribute('value');
          const txt = id ? await page.$eval(`label[for="${id}"]`, l => l.innerText).catch(() => val) : val;
          return { value: val, text: txt, element: r };
        }));
        const match = ScreeningQuestionMatcher.matchQuestion({
          questionText: labelText,
          fieldType: 'radio',
          options: radioLabels,
          candidate: candidateData
        });
        if (match.matched) {
          for (const rl of radioLabels) {
            if (rl.text.toLowerCase().includes(String(match.value).toLowerCase()) || rl.value === match.value) {
              await rl.element.check();
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
    const submitBtn = await page.$('#submit_app, button[type="submit"], input[type="submit"]');
    if (!submitBtn) {
      throw new Error('SUBMIT_BUTTON_NOT_FOUND: Could not locate Greenhouse submission button');
    }

    await submitBtn.click();
    // Wait for confirmation transition or modal
    await page.waitForTimeout(2000);

    return { submitted: true, status: 'SUBMITTED_IN_FLIGHT' };
  }

  async parseReceipt(page) {
    const isConfirmed = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const hasConfirmText = text.includes('thank you for applying') || 
                             text.includes('application submitted') || 
                             text.includes('we have received your application');
      const confNumEl = document.querySelector('[data-confirmation-number], .confirmation-number, #confirmation-number');
      return {
        confirmed: hasConfirmText,
        confirmationNumber: confNumEl ? confNumEl.innerText.trim() : null
      };
    });

    return {
      confirmed: isConfirmed.confirmed,
      ats: 'greenhouse',
      confirmationNumber: isConfirmed.confirmationNumber || `GH-${Date.now().toString().slice(-8)}`,
      receiptTimestamp: new Date().toISOString()
    };
  }
}

module.exports = GreenhouseAdapter;
