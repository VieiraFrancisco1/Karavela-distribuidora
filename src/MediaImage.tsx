import { useEffect, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { resolvePhotoUrl } from './firebaseStore'
export function usePhotoUrl(src: string | undefined) {
  const [resolved, setResolved] = useState<{ src: string; url: string }>({ src: '', url: '' })
  useEffect(() => {
    if (!src?.startsWith('fmedia:')) return
    let active = true
    void resolvePhotoUrl(src).then(url => { if (active) setResolved({ src, url }) }).catch(() => { if (active) setResolved({ src, url: '/assets/logo-karavela.png' }) })
    return () => { active = false }
  }, [src])
  return src?.startsWith('fmedia:') ? (resolved.src === src ? resolved.url : undefined) : src
}
export default function MediaImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const url = usePhotoUrl(src)
  return <img {...props} src={url} />
}
