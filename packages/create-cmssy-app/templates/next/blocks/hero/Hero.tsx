export interface HeroContent {
  heading?: string;
  text?: string;
}

export default function Hero({ content }: { content: HeroContent }) {
  return (
    <section>
      <h1>{content.heading}</h1>
      {content.text ? <p>{content.text}</p> : null}
    </section>
  );
}
