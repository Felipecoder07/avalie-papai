import { useCallback, useLayoutEffect, useRef } from 'react';

// Commands invoked by explicit triggers (submit, tab, debounce or polling) need
// the latest form values without making every keystroke trigger the command.
export function useEventCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const current = useRef(callback);
  useLayoutEffect(() => { current.current = callback; }, [callback]);
  return useCallback((...args: Args) => current.current(...args), []);
}
