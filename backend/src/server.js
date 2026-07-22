import 'dotenv/config';
import { app } from './app.js';
import { startProductionDeadlineCron } from './jobs/productionDeadlineAlerts.js';

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Nexora CRM backend listening on http://localhost:${port}`);
  startProductionDeadlineCron();
});
