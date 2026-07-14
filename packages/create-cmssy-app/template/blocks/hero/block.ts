import { defineBlock, fields } from "@cmssy/react";
import Hero from "./Hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: {
    heading: fields.text({ label: "Heading", required: true }),
    text: fields.textarea({ label: "Text" }),
  },
  // A loader runs SERVER-SIDE before the block renders, so a block can read data
  // (products, posts) the same way a page can. Import it dynamically: it may
  // touch the cmssy config, which must never reach the browser.
  //
  // loader: async () => {
  //   const { loadPosts } = await import("./load-posts");
  //   return { posts: await loadPosts() };
  // },
});
