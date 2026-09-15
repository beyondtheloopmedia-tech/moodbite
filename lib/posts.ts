/**
 * The smallest amount of formatting a post needs, and no more.
 *
 * Deliberately not a markdown library and deliberately not HTML. Everything
 * here returns structured data that the page renders as React text nodes, so
 * an injected `<script>` in a post body is displayed rather than executed.
 * That property is worth more than italics: the day this becomes a review site
 * is the day post bodies stop being written only by us.
 *
 * Supported, because these are what a piece of writing actually needs:
 *   ## heading
 *   > quote
 *   blank line between paragraphs
 */
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "para"; text: string };

export function parseBody(body: string): Block[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      if (chunk.startsWith("## ")) return { kind: "heading", text: chunk.slice(3).trim() };
      if (chunk.startsWith("> ")) {
        return { kind: "quote", text: chunk.replace(/^> ?/gm, "").trim() };
      }
      // single newlines inside a paragraph are the writer's line breaks, kept
      return { kind: "para", text: chunk };
    });
}

/**
 * A URL from a title. Kept separate from the title on purpose: the title can be
 * corrected, the slug cannot, because every link anyone has shared depends on it.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Roughly how long this takes to read, at a slow-ish 200 words a minute. */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
