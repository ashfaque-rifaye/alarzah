import { RefObject, useEffect, useState } from 'react'

/** True while the element is on screen; used to pause WebGL scenes that are scrolled away. */
export function useVisible(ref: RefObject<Element>, margin = '150px') {
  const [v, setV] = useState(true)
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { rootMargin: margin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [ref, margin])
  return v
}
