import { defineBlock } from "@cmssy/react";
import Hero, { heroProps } from "./Hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});
