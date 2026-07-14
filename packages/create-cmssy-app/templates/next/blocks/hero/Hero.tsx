import { fields, type BlockProps } from "@cmssy/react";

// The schema lives next to the component that reads it, and types it. Rename a
// field here and this file stops compiling - it cannot render an empty block.
export const heroProps = {
  heading: fields.text({ label: "Heading", required: true }),
  text: fields.textarea({ label: "Text" }),
};

export default function Hero({ content }: BlockProps<typeof heroProps>) {
  return (
    <section>
      <h1>{content.heading}</h1>
      {content.text ? <p>{content.text}</p> : null}
    </section>
  );
}
