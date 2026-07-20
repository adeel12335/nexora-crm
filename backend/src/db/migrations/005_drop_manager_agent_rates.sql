-- Drop manager-cut history.
--
-- Commission is user-wise only: each agent/manager has their own monthly rate.
-- A separate manager→agent cut is not part of the model, so the table left
-- behind by 004 is removed here.

DROP TABLE IF EXISTS manager_agent_rates;
