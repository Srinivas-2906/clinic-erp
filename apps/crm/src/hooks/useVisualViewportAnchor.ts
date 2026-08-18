import { useEffect, type RefObject } from 'react';

/** Keeps a fixed overlay aligned with the visible viewport when the mobile keyboard opens. */
export function useVisualViewportAnchor(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    function sync() {
      const node = ref.current;
      const vp = window.visualViewport;
      if (!node || !vp) return;
      node.style.top = `${vp.offsetTop}px`;
      node.style.left = `${vp.offsetLeft}px`;
      node.style.width = `${vp.width}px`;
      node.style.height = `${vp.height}px`;
    }

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      const node = ref.current;
      if (node) {
        node.style.top = '';
        node.style.left = '';
        node.style.width = '';
        node.style.height = '';
      }
    };
  }, [ref, enabled]);
}
