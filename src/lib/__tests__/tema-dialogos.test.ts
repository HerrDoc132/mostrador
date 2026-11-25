import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TP5-40: regresión del diálogo de confirmación transparente. Los tokens de
 * globals.css son oklch; envolverlos en hsl() en Tailwind generaba CSS inválido
 * y `bg-background` no pintaba nada sobre el overlay.
 */
const tailwindConfig = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");
const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("tokens de color usados por diálogos y overlays (TP5-40)", () => {
  it("usa las variables de color directamente, sin envolverlas en hsl()", () => {
    expect(tailwindConfig).not.toMatch(/hsl\(var\(--/);
    expect(tailwindConfig).toContain('background: "var(--background)"');
    expect(tailwindConfig).toContain('popover: {\n          DEFAULT: "var(--popover)"');
  });

  it("define el color de texto para acciones destructivas", () => {
    expect(globalsCss).toContain("--destructive-foreground:");
    expect(tailwindConfig).toContain('foreground: "var(--destructive-foreground)"');
  });
});
