import { fields, type BlockProps } from "@cmssy/react";

// The schema lives next to the component that reads it, and types it. Rename a
// field here and this file stops compiling - it cannot render an empty block.
export const heroProps = {
  title: fields.text({ label: "Title", required: true }),
  subtitle: fields.text({ label: "Subtitle" }),
};

export function Hero({ content }: BlockProps<typeof heroProps>) {
  return (
    <section>
      <h1>{content.title}</h1>
      {content.subtitle ? <p>{content.subtitle}</p> : null}
    </section>
  );
}
