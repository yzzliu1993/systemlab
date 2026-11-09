import { z } from 'zod';

export const SECTION_NAMES = [
  'situation',
  'terms',
  'how',
  'practice',
  'extreme',
  'config',
  'sources',
] as const;

export const sectionNameSchema = z.enum(SECTION_NAMES);
export type SectionName = z.infer<typeof sectionNameSchema>;

export const inlineSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('code'), text: z.string() }),
  z.object({
    type: z.literal('link'),
    text: z.string(),
    url: z.string().min(1),
  }),
]);
export type Inline = z.infer<typeof inlineSchema>;

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'term'; name: string; blocks: Block[] };

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), inlines: z.array(inlineSchema) }),
    z.object({
      type: z.literal('list'),
      items: z.array(z.array(inlineSchema)),
    }),
    z.object({ type: z.literal('code'), lang: z.string(), text: z.string() }),
    z.object({
      type: z.literal('term'),
      name: z.string().min(1),
      blocks: z.array(blockSchema),
    }),
  ]),
);

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
});
export type Source = z.infer<typeof sourceSchema>;

export const chapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** Sections in file order, without `sources`. */
  sections: z.array(
    z.object({
      name: sectionNameSchema.exclude(['sources']),
      blocks: z.array(blockSchema),
    }),
  ),
  sources: z.array(sourceSchema).min(1),
});
export type Chapter = z.infer<typeof chapterSchema>;
