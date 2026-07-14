export function Hero({
  content,
}: {
  content: { title?: string; subtitle?: string };
}) {
  return (
    <section>
      <h1>{content.title}</h1>
      {content.subtitle ? <p>{content.subtitle}</p> : null}
    </section>
  );
}
