// Rolevia AI · Local ATS Staging Fixtures
// Provides realistic, locally controlled Greenhouse, Ashby, Lever, and Workday application pages.
// Allows complete automated testing of form inspection, field population, file uploads,
// screening question grounding, validation, and confirmation parsing with zero real-employer impact.

// Zero third-party dependencies - pure Node.js templates

const FIXTURES = {
  greenhouse: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GitLab Careers - Backend Engineer (Python)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #1a1a1a; }
    .field { margin-bottom: 16px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input[type="text"], input[type="email"], input[type="tel"], select, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    .custom-question { margin-top: 18px; padding-top: 12px; border-top: 1px solid #eee; }
    button[type="submit"] { background: #16a34a; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
    #confirmation-screen { display: none; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 24px; border-radius: 8px; margin-top: 20px; text-align: center; }
  </style>
</head>
<body data-mapped="greenhouse">
  <h1>Apply for Backend Engineer (Python) · GitLab</h1>
  <p>Greenhouse Official Application Portal (Local Staging Fixture)</p>

  <form id="application_form" onsubmit="event.preventDefault(); document.getElementById('application_form').style.display='none'; document.getElementById('confirmation-screen').style.display='block';">
    <div class="field">
      <label for="first_name">First Name *</label>
      <input type="text" id="first_name" name="first_name" required>
    </div>
    <div class="field">
      <label for="last_name">Last Name *</label>
      <input type="text" id="last_name" name="last_name" required>
    </div>
    <div class="field">
      <label for="email">Email *</label>
      <input type="email" id="email" name="email" required>
    </div>
    <div class="field">
      <label for="phone">Phone *</label>
      <input type="tel" id="phone" name="phone" required>
    </div>
    <div class="field">
      <label for="job_application_location">Location (City, Country) *</label>
      <input type="text" id="job_application_location" name="job_application[location]" required>
    </div>
    <div class="field">
      <label for="resume_file">Resume/CV (PDF) *</label>
      <input type="file" id="resume_file" name="resume" accept=".pdf" required>
    </div>

    <!-- Screening Questions -->
    <div class="custom-question">
      <label>Will you now or in the future require visa sponsorship? *</label>
      <select id="sponsorship_select" name="job_application[answers_attributes][0][value]" required>
        <option value="">-- Please select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
    <div class="custom-question">
      <label>Are you legally authorized to work in the United States? *</label>
      <div>
        <label><input type="radio" name="auth_radio" id="auth_yes" value="Yes" required> Yes</label>
        <label><input type="radio" name="auth_radio" id="auth_no" value="No"> No</label>
      </div>
    </div>
    <div class="custom-question">
      <label for="q_python_exp">How many years of Python experience do you have? *</label>
      <input type="text" id="q_python_exp" name="job_application[answers_attributes][1][value]" required>
    </div>

    <div style="margin-top: 24px;">
      <button type="submit" id="submit_app">Submit Application</button>
    </div>
  </form>

  <div id="confirmation-screen">
    <h2>Thank you for applying to GitLab!</h2>
    <p>Your application has been received and indexed into our recruiting system.</p>
    <p>Official Confirmation Number: <strong id="confirmation-number" class="confirmation-number">GH-91823746</strong></p>
  </div>
</body>
</html>`,

  ashby: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenAI - Research Engineer - AI Systems & Scaling</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #111; }
    .field { margin-bottom: 16px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input[type="text"], input[type="email"], select { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    button { background: #10a37f; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
    #confirmation-view { display: none; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 24px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body data-mapped="ashby">
  <h1>Apply for Research Engineer · OpenAI</h1>
  <p>Ashby Recruiting Gateway (Local Staging Fixture)</p>

  <form id="ashby-form" data-ashby-form onsubmit="event.preventDefault(); document.getElementById('ashby-form').style.display='none'; document.getElementById('confirmation-view').style.display='block';">
    <div class="field">
      <label for="candidate_name">Full Name *</label>
      <input type="text" id="candidate_name" name="name" data-testid="name-input" required>
    </div>
    <div class="field">
      <label for="candidate_email">Email *</label>
      <input type="email" id="candidate_email" name="email" data-testid="email-input" required>
    </div>
    <div class="field">
      <label for="candidate_phone">Phone Number *</label>
      <input type="text" id="candidate_phone" name="phoneNumber" data-testid="phone-input" required>
    </div>
    <div class="field">
      <label for="resume-input">Resume (PDF) *</label>
      <input type="file" id="resume-input" data-testid="resume-upload-input" accept=".pdf" required>
    </div>

    <!-- Screening Questions -->
    <div class="field ashby-question" data-testid="question-container-education">
      <label for="edu-select">Highest level of education completed? *</label>
      <select id="edu-select" required>
        <option value="">Select an option</option>
        <option value="Bachelor's Degree">Bachelor's Degree</option>
        <option value="Master's Degree">Master's Degree</option>
        <option value="PhD / Doctorate">PhD / Doctorate</option>
      </select>
    </div>
    <div class="field ashby-question" data-testid="question-container-sponsorship">
      <label>Will you now or in the future require visa sponsorship? *</label>
      <select id="sponsorship-select" required>
        <option value="">Select an option</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>

    <div style="margin-top: 24px;">
      <button type="submit" data-testid="application-submit-button" id="ashby-submit-btn">Submit Application</button>
    </div>
  </form>

  <div id="confirmation-view" data-testid="application-submitted-container">
    <h2>Thank you for applying to OpenAI!</h2>
    <p>Application submitted successfully.</p>
    <p>Confirmation Code: <strong data-testid="confirmation-id" class="ashby-confirmation-code">ASHBY-550291</strong></p>
  </div>
</body>
</html>`,

  lever: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Canonical Careers - Cloud Field Engineer</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #333; }
    .field { margin-bottom: 16px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input[type="text"], input[type="email"] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
    button { background: #007acc; color: white; padding: 12px 24px; border: none; border-radius: 4px; font-size: 16px; font-weight: 600; cursor: pointer; }
    #lever-confirmation { display: none; background: #f0f9ff; border: 1px solid #bae6fd; padding: 24px; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body data-mapped="lever">
  <h1>Apply at Canonical · Cloud Field Engineer</h1>
  <p>Lever Fast-Track Portal (Local Staging Fixture)</p>

  <form id="lever-form" data-lever-form onsubmit="event.preventDefault(); document.getElementById('lever-form').style.display='none'; document.getElementById('lever-confirmation').style.display='block';">
    <div class="field">
      <label for="name">Full Name *</label>
      <input type="text" id="name" name="name" required>
    </div>
    <div class="field">
      <label for="email">Email *</label>
      <input type="email" id="email" name="email" required>
    </div>
    <div class="field">
      <label for="phone">Phone *</label>
      <input type="text" id="phone" name="phone" required>
    </div>
    <div class="field">
      <label for="org">Current Company</label>
      <input type="text" id="org" name="org">
    </div>
    <div class="field">
      <label for="urls-linkedin">LinkedIn URL</label>
      <input type="text" id="urls-linkedin" name="urls[LinkedIn]">
    </div>
    <div class="field">
      <label for="urls-github">GitHub URL</label>
      <input type="text" id="urls-github" name="urls[GitHub]">
    </div>
    <div class="field">
      <label for="resume-upload-input">Resume *</label>
      <input type="file" id="resume-upload-input" name="resume" accept=".pdf" required>
    </div>

    <!-- Screening Questions -->
    <div class="field application-question">
      <label class="application-label">Will you now or in the future require visa sponsorship? *</label>
      <div>
        <label><input type="radio" name="sponsor_radio" value="Yes" required> Yes</label>
        <label><input type="radio" name="sponsor_radio" value="No"> No</label>
      </div>
    </div>

    <div style="margin-top: 24px;">
      <button type="submit" id="btn-submit" class="template-btn-submit">Submit Application</button>
    </div>
  </form>

  <div id="lever-confirmation" class="application-submitted">
    <h3>Application submitted!</h3>
    <p>Thanks for applying to Canonical. We will review your profile shortly.</p>
    <p>Receipt Reference: <strong data-confirmation-code class="lever-confirmation-id">LEVER-440192</strong></p>
  </div>
</body>
</html>`,

  workday: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Autodesk Careers - Software Architect</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #222; }
    .step-section { margin-bottom: 20px; }
    .hidden { display: none !important; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input[type="text"], input[type="email"], select { width: 100%; padding: 10px; border: 1px solid #aaa; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
    button { background: #0654ba; color: white; padding: 10px 20px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; }
    #wd-confirmation { background: #f8fafc; border: 1px solid #cbd5e1; padding: 24px; border-radius: 6px; }
  </style>
</head>
<body data-mapped="workday" data-automation-id="workday-application">
  <h1>Autodesk · Software Architect Application</h1>
  <p>Workday Cloud Experience (Multi-Step Local Staging Fixture)</p>

  <div id="step-1" class="step-section">
    <h3>Step 1: Contact Information</h3>
    <div style="margin-bottom:12px;">
      <label>First Name *</label>
      <input type="text" id="wd-first-name" data-automation-id="legalNameSection_firstName" required>
    </div>
    <div style="margin-bottom:12px;">
      <label>Last Name *</label>
      <input type="text" id="wd-last-name" data-automation-id="legalNameSection_lastName" required>
    </div>
    <div style="margin-bottom:12px;">
      <label>Email *</label>
      <input type="email" id="wd-email" data-automation-id="email" required>
    </div>
    <div style="margin-bottom:12px;">
      <label>Phone *</label>
      <input type="text" id="wd-phone" data-automation-id="phone-number" required>
    </div>
    <button type="button" id="wd-btn-next" data-automation-id="bottom-navigation-next-button" onclick="document.getElementById('step-1').classList.add('hidden'); document.getElementById('step-2').classList.remove('hidden');">Next Step</button>
  </div>

  <div id="step-2" class="step-section hidden">
    <h3>Step 2: Resume & Questionnaire</h3>
    <div style="margin-bottom:12px;" data-automation-id="file-upload-dropzone">
      <label>Resume (PDF) *</label>
      <input type="file" id="wd-resume-file" accept=".pdf" required>
    </div>
    <div style="margin-bottom:12px;" data-automation-id="question-sponsorship" class="wd-question-row">
      <label class="wd-question-label">Will you now or in the future require visa sponsorship? *</label>
      <select id="wd-sponsorship-select" required>
        <option value="">-- Select --</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
    <button type="button" id="wd-btn-submit" data-automation-id="bottom-navigation-submit-button" onclick="document.getElementById('step-2').classList.add('hidden'); document.getElementById('wd-confirmation').classList.remove('hidden');">Submit</button>
  </div>

  <div id="wd-confirmation" class="hidden" data-automation-id="thankYouMessage">
    <h2>Thank you for your application!</h2>
    <p>Your submission was received by Autodesk Recruiting.</p>
    <p>Confirmation Number: <strong data-automation-id="confirmation-number" class="wd-confirmation-code">WD-889102</strong></p>
  </div>
</body>
</html>`
};

function getFixtureHtml(type) {
  return FIXTURES[type] || null;
}

module.exports = {
  getFixtureHtml
};
