import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/lib/themes";

type Ctx = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
};

const ThemeContext = createContext<Ctx>({
  theme: DEFAULT_THEME,
  setTheme: async () => {},
});

const LS_KEY = "workflow.theme";

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const ls = window.localStorage.getItem(LS_KEY);
    return isThemeId(ls) ? ls : DEFAULT_THEME;
  });

  // Apply immediately on mount + when theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load from DB when user signs in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_calendar_prefs")
        .select("theme_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const dbTheme = data?.theme_id;
      if (isThemeId(dbTheme)) {
        setThemeState(dbTheme);
        window.localStorage.setItem(LS_KEY, dbTheme);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setTheme = useCallback(
    async (id: ThemeId) => {
      setThemeState(id);
      window.localStorage.setItem(LS_KEY, id);
      if (!user) return;
      await supabase
        .from("user_calendar_prefs")
        .upsert(
          { user_id: user.id, theme_id: id },
          { onConflict: "user_id" },
        );
    },
    [user],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
