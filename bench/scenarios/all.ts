import { default as userFlow }   from './s01_user_flow.ts';
import { default as itemFlow }   from './s02_item_flow.ts';
import { default as bidFlow }    from './s03_bid_flow.ts';
import { default as selectFlow } from './s04_select_flow.ts';

export { userFlow, itemFlow, bidFlow, selectFlow };

const stages = [
  { duration: '30s', target: 5   },
  { duration: '1m',  target: 20  },
  { duration: '2m',  target: 50  },
  { duration: '2m',  target: 100 },
  { duration: '3m',  target: 200 },
  { duration: '2m',  target: 500 },
  { duration: '2m',  target: 0   },
];

export const options = {
  scenarios: {
    user_flow:   { executor: 'ramping-vus', exec: 'userFlow',   startVUs: 0, stages },
    item_flow:   { executor: 'ramping-vus', exec: 'itemFlow',   startVUs: 0, stages },
    bid_flow:    { executor: 'ramping-vus', exec: 'bidFlow',    startVUs: 0, stages },
    select_flow: { executor: 'ramping-vus', exec: 'selectFlow', startVUs: 0, stages },
  },
};
