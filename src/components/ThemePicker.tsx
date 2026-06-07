import { Check } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { useTheme } from "@/lib/theme-context";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3">
      {THEMES.map((t) => {
        const active = theme === t.id;
        const gradient = `linear-gradient(135deg, ${t.swatch.join(", ")})`;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`relative rounded-2xl overflow-hidden text-left transition-all active:scale-[0.98] ${
              active ? "ring-2 ring-foreground/80 ring-offset-2 ring-offset-background" : "ring-1 ring-border"
            }`}
          >
            <div
              className="h-20 w-full"
              style={{ background: gradient }}
              aria-hidden
            />
            <div className="bg-card px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold truncate">{t.name}</span>
                {active && (
                  <span className="ml-auto w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
