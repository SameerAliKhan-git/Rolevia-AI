
    const { executeApplicationWorkflow } = require('../../backend/atsAutomation');
    const [,, appId, userId, tenantId, mode, simulateCrash] = process.argv;

    async function run() {
      try {
        const res = await executeApplicationWorkflow(appId, {
          userId,
          tenantId,
          mode: mode || 'DRY_RUN',
          allowLiveSubmission: true,
          simulatePreSubmitInterruption: simulateCrash === 'true'
        });
        process.send && process.send({ success: true, res });
        process.exit(0);
      } catch (err) {
        process.send && process.send({ success: false, error: err.message });
        process.exit(1);
      }
    }
    run();
  