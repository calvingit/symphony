import { Liquid } from "liquidjs";

const engine = new Liquid({ strictVariables: true, strictFilters: true });

export async function renderPrompt(
  template: string,
  input: { issue: unknown; attempt: number | null },
): Promise<string> {
  const effectiveTemplate = template.trim() === "" ? "You are working on an issue from Linear." : template;
  try {
    return await engine.parseAndRender(effectiveTemplate, input);
  } catch (error) {
    throw new Error(`template_render_error: ${String(error)}`);
  }
}
