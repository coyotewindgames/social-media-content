/**
 * Correctly typed re-export of window.spark.llmPrompt.
 * The @github/spark package declares llmPrompt(strings: string[], ...) but
 * tagged template literals pass TemplateStringsArray, causing TS2345.
 */
export function llmPrompt(strings: TemplateStringsArray, ...values: unknown[]): string {
  return (window.spark.llmPrompt as Function).call(null, strings, ...values) as string;
}
