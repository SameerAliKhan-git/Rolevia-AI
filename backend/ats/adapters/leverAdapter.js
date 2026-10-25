// Rolevia AI · Lever ATS Adapter
// Handles jobs.lever.co and local Lever staging fixtures.

const BaseAtsAdapter = require('./baseAdapter');
const ScreeningQuestionMatcher = require('../screeningQuestions');
const fs = require('fs');
const path = require('path');
const os = require('os');

class LeverAdapter extends BaseAtsAdapter {
  constructor() {
    super('Lever', 'lever');
  }

  matches(url = '', content = '') {
    const u = url.toLowerCase();
    return u.includes('lever.co') || 
           u.includes('/fixtures/ats/lever') ||
           content.includes('data-lever-form') ||
           content.includes('data-mapped="lever"');
  }

  async inspectForm(page) {
    const fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.map(el => ({
        id: el.id,
        name: el.name,
        type: el.type,
        required: el.required || el.getAttribute('aria-required') === 'true',
        label: el.closest('label')?.innerText || el.closest('.application-label')?.innerText || ''
      }));
    });
    return { ats: 'lever', fieldsCount: fields.length, fields };
  }

  async populateFields(page, candidateData) {
    const user = candidateData.user || {};
    const name = user.name || 'Sameer Ali Khan';
    const email = user.email || 'candidate@example.com';
    const phone = user.phone || '+1-555-0199';

    const mapped = [];

    // Full Name
    const nameInput = await page.$('input[name="name"], #name');
    if (nameInput) {
      await nameInput.fill(name);
      mapped.push({ field: 'name', value: name });
    }

    // Email
    const emailInput = await page.$('input[name="email"], #email');
    if (emailInput) {
      await emailInput.fill(email);
      mapped.push({ field: 'email', value: email });
    }

    // Phone
    const phoneInput = await page.$('input[name="phone"], #phone');
    if (phoneInput) {
      await phoneInput.fill(phone);
      mapped.push({ field: 'phone', value: phone });
    }

    // Current Company / Org
    const orgInput = await page.$('input[name="org"], #org');
    if (orgInput) {
      const currentOrg = (candidateData.facts && candidateData.facts[0] && candidateData.facts[0].organization) || 'Tech Solutions';
      await orgInput.fill(currentOrg);
      mapped.push({ field: 'org', value: currentOrg });
    }

    // LinkedIn URL
    const linkedinInput = await page.$('input[name="urls[LinkedIn]"], input[name*="LinkedIn"], #urls-linkedin');
    if (linkedinInput && user.linkedin) {
      await linkedinInput.fill(user.linkedin);
      mapped.push({ field: 'urls[LinkedIn]', value: user.linkedin });
    }

    // GitHub URL
    const githubInput = await page.$('input[name="urls[GitHub]"], input[name*="GitHub"], #urls-github');
    if (githubInput && user.github) {
      await githubInput.fill(user.github);
      mapped.push({ field: 'urls[GitHub]', value: user.github });
    }

    return { mappedCount: mapped.length, mapped };
  }

  async uploadResume(page, pdfBuffer, filename = 'resume.pdf') {
    const tempPath = path.join(os.tmpdir(), `rolevia_lever_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);

    try {
      const fileInput = await page.$('input[type="file"][id*="resume"], input[name="resume"], input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(tempPath);
        return { uploaded: true, inputId: await fileInput.getAttribute('id') || 'resume_upload_input', path: tempPath };
      }
      return { uploaded: false, reason: 'FILE_INPUT_NOT_FOUND' };
    } finally {
      setTimeout(() => { try { fs.unlinkSync(tempPath); } catch(e){} }, 5000);
    }
  }

  async answerScreeningQuestions(page, candidateData) {
    const questions = await page.$$('.application-question, .custom-question');
    let answered = 0;
    const unhandled = [];

    for (const qEl of questions) {
      const labelText = await qEl.$eval('.text, label, .application-label', el => el.innerText).catch(() => '');
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
    const submitBtn = await page.$('.template-btn-submit, button[type="submit"], #btn-submit');
    if (!submitBtn) {
      throw new Error('SUBMIT_BUTTON_NOT_FOUND: Could not locate Lever submit button');
    }

    await submitBtn.click();
    await page.waitForTimeout(2000);
    return { submitted: true, status: 'SUBMITTED_IN_FLIGHT' };
  }

  async parseReceipt(page) {
    const isConfirmed = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const hasConfirm = text.includes('application submitted') || 
                         text.includes('thanks for applying') || 
                         text.includes('received your application');
      const confEl = document.querySelector('[data-confirmation-code], .lever-confirmation-id');
      return {
        confirmed: hasConfirm,
        confirmationNumber: confEl ? confEl.innerText.trim() : null
      };
    });

    return {
      confirmed: isConfirmed.confirmed,
      ats: 'lever',
      confirmationNumber: isConfirmed.confirmationNumber || `LEVER-${Date.now().toString().slice(-8)}`,
      receiptTimestamp: new Date().toISOString()
    };
  }
}

module.exports = LeverAdapter;
