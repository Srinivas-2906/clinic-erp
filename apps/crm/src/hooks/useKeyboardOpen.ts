import { useEffect, useState } from 'react';

function isTextField(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'image'].includes(type);
}

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    function sync() {
      setOpen(isTextField(document.activeElement));
    }

    function onFocusIn(e: FocusEvent) {
      if (blurTimer) clearTimeout(blurTimer);
      if (isTextField(e.target)) setOpen(true);
    }

    function onFocusOut() {
      blurTimer = setTimeout(sync, 100);
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return open;
}
