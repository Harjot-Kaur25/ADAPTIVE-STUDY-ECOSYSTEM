import { useEffect } from 'react';

export default function ScrollEffects() {
  useEffect(() => {
    const root = document.documentElement;
    let scrollFrame = 0;
    const updateScroll = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        const progress = range > 0 ? window.scrollY / range : 0;
        root.style.setProperty('--scroll-progress', `${progress * 100}%`);
        root.style.setProperty('--page-drift', `${window.scrollY * -0.08}px`);
      });
    };

    let pointerFrame = 0;
    let pointerEnabled = false;
    let lastFrameTime = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    const finePointer = window.matchMedia('(any-pointer: fine) and (any-hover: hover)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const writeOffsets = () => {
      root.style.setProperty('--aurora-front-x', `${currentX.toFixed(3)}px`);
      root.style.setProperty('--aurora-front-y', `${currentY.toFixed(3)}px`);
      root.style.setProperty('--aurora-rear-x', `${(currentX * 0.5).toFixed(3)}px`);
      root.style.setProperty('--aurora-rear-y', `${(currentY * 0.5).toFixed(3)}px`);
    };

    const animatePointer = (time: number) => {
      pointerFrame = 0;
      const elapsed = lastFrameTime ? Math.min(time - lastFrameTime, 48) : 16.7;
      lastFrameTime = time;
      const easing = 1 - Math.exp(-elapsed / 300);
      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      writeOffsets();

      if (Math.abs(targetX - currentX) > 0.035 || Math.abs(targetY - currentY) > 0.035) {
        pointerFrame = requestAnimationFrame(animatePointer);
      } else {
        currentX = targetX;
        currentY = targetY;
        writeOffsets();
        lastFrameTime = 0;
      }
    };

    const startPointerAnimation = () => {
      if (!pointerFrame) {
        lastFrameTime = 0;
        pointerFrame = requestAnimationFrame(animatePointer);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled || event.pointerType !== 'mouse') return;
      const nx = Math.max(-1, Math.min(1, (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2));
      targetX = nx * 20;
      targetY = ny * 12;
      startPointerAnimation();
    };

    const resetPointerTarget = () => {
      targetX = 0;
      targetY = 0;
      startPointerAnimation();
    };

    const syncPointerMode = () => {
      const shouldEnable = finePointer.matches && !reducedMotion.matches;
      if (shouldEnable === pointerEnabled) return;
      pointerEnabled = shouldEnable;
      if (pointerEnabled) {
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('blur', resetPointerTarget);
        root.addEventListener('pointerleave', resetPointerTarget);
      } else {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('blur', resetPointerTarget);
        root.removeEventListener('pointerleave', resetPointerTarget);
        cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        targetX = 0;
        targetY = 0;
        currentX = 0;
        currentY = 0;
        lastFrameTime = 0;
        writeOffsets();
      }
    };

    updateScroll();
    syncPointerMode();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    finePointer.addEventListener('change', syncPointerMode);
    reducedMotion.addEventListener('change', syncPointerMode);

    return () => {
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(pointerFrame);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', resetPointerTarget);
      root.removeEventListener('pointerleave', resetPointerTarget);
      finePointer.removeEventListener('change', syncPointerMode);
      reducedMotion.removeEventListener('change', syncPointerMode);
      root.style.removeProperty('--aurora-front-x');
      root.style.removeProperty('--aurora-front-y');
      root.style.removeProperty('--aurora-rear-x');
      root.style.removeProperty('--aurora-rear-y');
    };
  }, []);

  return <div className="scroll-progress" aria-hidden="true"><span /></div>;
}
