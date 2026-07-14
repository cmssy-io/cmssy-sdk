import { defineBlock } from "@cmssy/react";
import { Hero, heroProps } from "./hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});

export const blocks = [heroBlock];
export default blocks;
