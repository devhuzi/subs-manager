/**
 * Curated OpenRouter models shown in the Settings dropdown. `vision: true`
 * means the model can read image attachments; models without it (e.g.
 * DeepSeek) are text-only and reject images.
 *
 * `recommended` surfaces a default suggestion — Gemma 4 26B is cheap, smart,
 * and image-capable, so it's the safe all-rounder for this app.
 */
export interface ModelOption {
  value: string;
  label: string;
  vision?: boolean;
  recommended?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B — recommended',
    vision: true,
    recommended: true,
  },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', vision: true },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (cheap)', vision: true },
  { value: 'openai/gpt-4o', label: 'GPT-4o', vision: true },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (cheap)', vision: true },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
  { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash (cheap, no images)' },
];

/**
 * Whether the given model can read image attachments. Only *known* text-only
 * models (curated, no `vision`) return false — custom/unknown slugs get the
 * benefit of the doubt so we never wrongly block an image-capable custom model.
 */
export const modelSupportsVision = (modelId: string): boolean => {
  const known = MODEL_OPTIONS.find((m) => m.value === modelId);
  if (!known) return true; // custom/unknown slug — let the provider decide
  return Boolean(known.vision);
};

/** Display label for a model id, falling back to the raw slug for custom models. */
export const modelLabel = (modelId: string): string =>
  MODEL_OPTIONS.find((m) => m.value === modelId)?.label ?? modelId;
