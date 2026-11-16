import { useEffect, useState } from "react";

/**
 * useVisualViewport
 * 
 * Ensures robust keyboard awareness on mobile devices (iOS Safari & Android Chrome).
 * - Tracks window.visualViewport height when virtual keyboard appears/disappears.
 * - Sets the `--visual-viewport-height` CSS custom property on <html>.
 * - Keeps window.scrollY locked to 0 to prevent mobile browsers from pushing
 *   the chat header off-screen when an input is focused.
 * - Detects keyboard visibility and provides viewport dimensions.
 */
export function useVisualViewport() {
  const [viewportHeight, setViewportHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return window.visualViewport?.height || window.innerHeight;
    }
    return 800;
  });

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateHeight = () => {
      const vv = window.visualViewport;
      const currentHeight = vv ? vv.height : window.innerHeight;
      const fullHeight = window.innerHeight;

      setViewportHeight(currentHeight);

      // On mobile, if visual viewport is significantly smaller than innerHeight, keyboard is open
      const keyboardActive = fullHeight - currentHeight > 150;
      setIsKeyboardOpen(keyboardActive);

      // Set CSS custom property for exact layout sizing
      document.documentElement.style.setProperty(
        "--visual-viewport-height",
        `${currentHeight}px`
      );

      // Ensure window-level scroll remains at 0 so chat header is never pushed off-screen
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        // Double check scroll offset after browser finishes its default focus scroll
        requestAnimationFrame(() => {
          if (window.scrollY !== 0) {
            window.scrollTo(0, 0);
          }
        });
        setTimeout(() => {
          if (window.scrollY !== 0) {
            window.scrollTo(0, 0);
          }
        }, 100);
      }
    };

    // Initialize CSS variable
    updateHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    } else {
      window.addEventListener("resize", updateHeight);
    }

    window.addEventListener("focusin", handleFocusIn);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport.removeEventListener("scroll", updateHeight);
      } else {
        window.removeEventListener("resize", updateHeight);
      }
      window.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  return { viewportHeight, isKeyboardOpen };
}
