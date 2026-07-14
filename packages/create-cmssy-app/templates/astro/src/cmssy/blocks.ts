import { defineBlock, fields } from "@cmssy/react";
import { Hero } from "./hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: {
    title: fields.text({ label: "Title", required: true }),
    subtitle: fields.text({ label: "Subtitle" }),
  },
});

export const blocks = [heroBlock];
export default blocks;
