import { createCmssyRobots } from "@cmssy/remix";
import { cmssy } from "../../cmssy.config";

export const loader = createCmssyRobots(cmssy);
