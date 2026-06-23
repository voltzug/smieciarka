import { default as userFlow } from "./s01_user_flow.ts";
import { default as itemFlow } from "./s02_item_flow.ts";
import { default as bidFlow } from "./s03_bid_flow.ts";
import { default as selectFlow } from "./s04_select_flow.ts";

export { userFlow, itemFlow, bidFlow, selectFlow };

const stages = [
  // Step 1
  { duration: "20s", target: 50 },
  { duration: "40s", target: 55 },
  // Step 2
  { duration: "10s", target: 100 },
  { duration: "40s", target: 110 },
  //{ duration: "10s", target: 140 },
  //{ duration: "40s", target: 150 },
  // Ramp Down
  { duration: "10s", target: 0 },
];

export const options = {
  scenarios: {
    user_flow: {
      executor: "ramping-vus",
      exec: "userFlow",
      startVUs: 0,
      stages,
    },
    item_flow: {
      executor: "ramping-vus",
      exec: "itemFlow",
      startVUs: 0,
      stages,
    },
    bid_flow: { executor: "ramping-vus", exec: "bidFlow", startVUs: 0, stages },
    /*select_flow: {
      executor: "ramping-vus",
      exec: "selectFlow",
      startVUs: 0,
      stages,
    },*/
  },
};
