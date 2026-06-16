import { useCallback, DragEventHandler, RefObject, useState, useEffect, useRef } from 'react';
import { getDataTransferFiles } from '../utils/dom';

const FILE_DRAG_RESET_DELAY_MS = 120;

const hasFileDrag = (dataTransfer?: DataTransfer | null): boolean =>
  Boolean(dataTransfer?.types.includes('Files'));

export const useFileDropHandler = (onDrop: (file: File[]) => void): DragEventHandler =>
  useCallback(
    (evt) => {
      const files = getDataTransferFiles(evt.dataTransfer);
      if (files) onDrop(files);
    },
    [onDrop]
  );

export const useFileDropZone = (
  zoneRef: RefObject<HTMLElement>,
  onDrop: (file: File[]) => void
): boolean => {
  const dragDepthRef = useRef(0);
  const resetTimerRef = useRef<number>();
  const [active, setActive] = useState(false);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = undefined;
    }
  }, []);

  const resetDragState = useCallback(() => {
    clearResetTimer();
    dragDepthRef.current = 0;
    setActive(false);
  }, [clearResetTimer]);

  const scheduleResetDragState = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(resetDragState, FILE_DRAG_RESET_DELAY_MS);
  }, [clearResetTimer, resetDragState]);

  useEffect(() => {
    const target = zoneRef.current;
    const handleDrop = (evt: DragEvent) => {
      if (!hasFileDrag(evt.dataTransfer)) return;

      evt.preventDefault();
      resetDragState();
      if (!evt.dataTransfer) return;
      const files = getDataTransferFiles(evt.dataTransfer);
      if (files) onDrop(files);
    };

    target?.addEventListener('drop', handleDrop);
    return () => {
      target?.removeEventListener('drop', handleDrop);
    };
  }, [zoneRef, onDrop, resetDragState]);

  useEffect(() => {
    const target = zoneRef.current;
    const isEventInsideTarget = (evt: DragEvent): boolean => {
      const eventTarget = evt.target;
      return eventTarget instanceof Node && !!target?.contains(eventTarget);
    };

    const handleDragEnter = (evt: DragEvent) => {
      if (!hasFileDrag(evt.dataTransfer)) return;

      evt.preventDefault();
      clearResetTimer();
      dragDepthRef.current += 1;
      setActive(true);
    };
    const handleDragLeave = (evt: DragEvent) => {
      if (!hasFileDrag(evt.dataTransfer)) return;

      const nextTarget = evt.relatedTarget;
      if (nextTarget instanceof Node && target?.contains(nextTarget)) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        scheduleResetDragState();
      }
    };
    const handleDragOver = (evt: DragEvent) => {
      const { dataTransfer } = evt;
      if (!dataTransfer || !hasFileDrag(dataTransfer)) return;

      evt.preventDefault();
      clearResetTimer();
      dataTransfer.dropEffect = 'copy';
      setActive(true);
    };
    const handleDocumentDragOver = (evt: DragEvent) => {
      if (!hasFileDrag(evt.dataTransfer)) return;
      if (isEventInsideTarget(evt)) return;

      scheduleResetDragState();
    };
    const handleWindowDragLeave = (evt: DragEvent) => {
      if (!hasFileDrag(evt.dataTransfer)) return;

      const leavingWindow =
        evt.clientX <= 0 ||
        evt.clientY <= 0 ||
        evt.clientX >= window.innerWidth ||
        evt.clientY >= window.innerHeight;

      if (leavingWindow || !evt.relatedTarget) {
        scheduleResetDragState();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetDragState();
      }
    };

    target?.addEventListener('dragenter', handleDragEnter);
    target?.addEventListener('dragleave', handleDragLeave);
    target?.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragover', handleDocumentDragOver, true);
    window.addEventListener('dragleave', handleWindowDragLeave, true);
    window.addEventListener('drop', resetDragState, true);
    window.addEventListener('dragend', resetDragState, true);
    window.addEventListener('blur', resetDragState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      target?.removeEventListener('dragenter', handleDragEnter);
      target?.removeEventListener('dragleave', handleDragLeave);
      target?.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragover', handleDocumentDragOver, true);
      window.removeEventListener('dragleave', handleWindowDragLeave, true);
      window.removeEventListener('drop', resetDragState, true);
      window.removeEventListener('dragend', resetDragState, true);
      window.removeEventListener('blur', resetDragState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearResetTimer();
    };
  }, [zoneRef, clearResetTimer, resetDragState, scheduleResetDragState]);

  return active;
};
