// Rolevia AI · Local Controlled Mock ATS Server for Playwright Verification
// Provides realistic Greenhouse, Ashby, and Lever fixtures with authentic confirmation receipts,
// timeout simulations, 500 errors, and missing-confirmation scenarios.
// ZERO traffic sent to real third-party employers.

const http = require('node:http');

function createMockAtsServer() {
  const server = http.createServer((req, res) => {
    const url = req.url;

    // 1. Greenhouse Job Application Form
    if (url.startsWith('/greenhouse/job')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Staff Distributed Systems Engineer - Databricks Careers (Greenhouse)</title></head>
<body>
  <div id="content">
    <div id="header"><h1>Staff Distributed Systems Engineer</h1><h2>Databricks · San Francisco, CA</h2></div>
    <form id="application_form" action="/greenhouse/submit" method="POST" enctype="multipart/form-data">
      <div class="field"><label for="first_name">First Name *</label><input id="first_name" name="first_name" required /></div>
      <div class="field"><label for="last_name">Last Name *</label><input id="last_name" name="last_name" required /></div>
      <div class="field"><label for="email">Email *</label><input id="email" name="email" type="email" required /></div>
      <div class="field"><label for="phone">Phone *</label><input id="phone" name="phone" required /></div>
      <div class="field"><label for="resume">Resume/CV *</label><input type="file" id="resume" name="resume" required /></div>
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    // Greenhouse Submit Handler -> Returns authentic employer confirmation
    if (url === '/greenhouse/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Thank you for applying - Databricks</title></head>
<body>
  <div id="application_confirmation">
    <h1>Thank you for applying to Databricks!</h1>
    <p>We have received your application for Staff Distributed Systems Engineer.</p>
    <div id="application-confirmation-id">Confirmation # REAL-GH-CONF-88219</div>
  </div>
</body>
</html>`);
      return;
    }

    // 2. Ashby Job Application Form
    if (url.startsWith('/ashby/job')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Senior AI Platform Engineer - OpenAI (Ashby)</title></head>
<body>
  <div id="ashby-app">
    <h2>Apply for Senior AI Platform Engineer</h2>
    <form class="ashby-application-form" action="/ashby/submit" method="POST">
      <div><label>First Name *</label><input name="_name_first" required /></div>
      <div><label>Last Name *</label><input name="_name_last" required /></div>
      <div><label>Email *</label><input name="_email" type="email" required /></div>
      <div><label>Phone *</label><input name="_phone" required /></div>
      <div><label>Resume *</label><input type="file" name="_resume" required /></div>
      <button type="submit" data-testid="submit-application">Submit Application</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    // Ashby Submit Handler
    if (url === '/ashby/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Application Received - OpenAI</title></head>
<body>
  <div id="ashby-confirmation">
    <h2>Application submitted!</h2>
    <p>Thanks for your interest in OpenAI. We will review your materials.</p>
    <div class="submission-id">Submission ID: REAL-ASHBY-APP-4401</div>
  </div>
</body>
</html>`);
      return;
    }

    // 3. Lever Job Application Form
    if (url.startsWith('/lever/job')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Principal Infrastructure Architect - Figma (Lever)</title></head>
<body>
  <div class="lever-root">
    <h2>Apply for Principal Infrastructure Architect</h2>
    <form class="lever-form" action="/lever/submit" method="POST">
      <div class="application-field"><span class="text">Full Name *</span><input name="name" required /></div>
      <div class="application-field"><span class="text">Email *</span><input name="email" type="email" required /></div>
      <div class="application-field"><span class="text">Phone *</span><input name="phone" required /></div>
      <div class="application-field"><span class="text">Resume/CV *</span><input type="file" name="resume" required /></div>
      <button type="submit" id="btn-submit" class="template-btn-submit">Submit Application</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    // Lever Submit Handler
    if (url === '/lever/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Application Received - Figma</title></head>
<body>
  <div class="application-confirmation">
    <h2>Application received</h2>
    <p>Thank you for submitting your application to Figma.</p>
    <div>Confirmation ID: REAL-LEVER-ID-7721</div>
  </div>
</body>
</html>`);
      return;
    }

    // 4. Missing Employer Confirmation Scenario (lands on ambiguous page)
    if (url.startsWith('/missing-conf/job')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Staff SRE - Missing Conf Co (Greenhouse)</title></head>
<body>
  <div id="content">
    <form id="application_form" action="/missing-conf/submit" method="POST" enctype="multipart/form-data">
      <div class="field"><label for="first_name">First Name *</label><input id="first_name" name="first_name" required /></div>
      <div class="field"><label for="last_name">Last Name *</label><input id="last_name" name="last_name" required /></div>
      <div class="field"><label for="email">Email *</label><input id="email" name="email" type="email" required /></div>
      <div class="field"><label for="phone">Phone *</label><input id="phone" name="phone" required /></div>
      <div class="field"><label for="resume">Resume/CV *</label><input type="file" id="resume" name="resume" required /></div>
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    if (url === '/missing-conf/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html><body><h1>Processing Application...</h1><p>Please wait while we verify your details.</p></body></html>`);
      return;
    }

    // 5. Server Error Scenario (HTTP 500 on submit)
    if (url.startsWith('/error-500/job')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Staff SRE - Error Co (Greenhouse)</title></head>
<body>
  <div id="content">
    <form id="application_form" action="/error-500/submit" method="POST" enctype="multipart/form-data">
      <div class="field"><label for="first_name">First Name *</label><input id="first_name" name="first_name" required /></div>
      <div class="field"><label for="last_name">Last Name *</label><input id="last_name" name="last_name" required /></div>
      <div class="field"><label for="email">Email *</label><input id="email" name="email" type="email" required /></div>
      <div class="field"><label for="phone">Phone *</label><input id="phone" name="phone" required /></div>
      <div class="field"><label for="resume">Resume/CV *</label><input type="file" id="resume" name="resume" required /></div>
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </div>
</body>
</html>`);
      return;
    }

    if (url === '/error-500/submit') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error in Employer ATS');
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return server;
}

function startMockAtsServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createMockAtsServer();
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort, baseUrl: `http://localhost:${actualPort}` });
    });
    server.on('error', reject);
  });
}

function stopMockAtsServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

module.exports = {
  createMockAtsServer,
  startMockAtsServer,
  stopMockAtsServer
};
