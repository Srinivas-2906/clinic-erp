import { useEffect } from 'react';

let lockCount = 0;
let savedScrollTop = 0;

export function useScrollLock(locked = true) {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;
    if (lockCount === 1) {
      const main = document.querySelector('.main-content') as HTMLElement | null;
      savedScrollTop = main?.scrollTop ?? window.scrollY;

      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');

      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollTop}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      if (main) {
        main.style.overflow = 'hidden';
        main.style.touchAction = 'none';
      }
    }

    function onTouchMove(e: TouchEvent) {
      const target = e.target;
      if (target instanceof Element && target.closest('.modal-sheet')) return;
      e.preventDefault();
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      lockCount -= 1;
      if (lockCount > 0) return;

      const main = document.querySelector('.main-content') as HTMLElement | null;

      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';

      if (main) {
        main.style.overflow = '';
        main.style.touchAction = '';
        main.scrollTop = savedScrollTop;
      }

      window.scrollTo(0, savedScrollTop);
    };
  }, [locked]);
}
